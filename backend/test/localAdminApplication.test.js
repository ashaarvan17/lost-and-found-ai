const assert = require("node:assert/strict");
const test = require("node:test");
const mongoose = require("mongoose");
const User = require("../src/models/User");
const LocalAdminApplication = require("../src/models/LocalAdminApplication");
const AuditEvent = require("../src/models/AuditEvent");
const controller = require("../src/controllers/localAdminApplicationController");
const recoveryController = require("../src/controllers/recoveryController");
const LocalAdminAssignment = require("../src/models/LocalAdminAssignment");

function response() { return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }
function stub(t, object, key, implementation) { const original = object[key]; object[key] = implementation; t.after(() => { object[key] = original; }); }
function query(value) { return { session() { return this; }, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } }; }
function transactionStub(t) { stub(t, mongoose, "startSession", async () => ({ withTransaction: async (callback) => callback(), endSession: async () => {} })); }

test("Local Admin application belongs to one ordinary account and has audited review metadata", () => {
  const schema = LocalAdminApplication.schema;
  assert.equal(schema.path("userId").options.unique, true);
  assert.deepEqual(schema.path("status").enumValues, ["pending", "approved", "rejected"]);
  assert.equal(User.schema.path("role").enumValues.includes("admin"), true);
  assert.equal(User.schema.path("role").enumValues.includes("local_admin"), false);
});

test("non-admin cannot read Local Admin applications", async (t) => {
  let queries = 0;
  stub(t, LocalAdminApplication, "find", () => { queries++; });
  const res = response();
  await controller.listApplications({ user: { role: "user" } }, res);
  assert.equal(res.statusCode, 403);
  assert.equal(queries, 0);
});

test("approval activates the applicant account and audits Super Admin identity in one transaction", async (t) => {
  transactionStub(t);
  const application = { _id: new mongoose.Types.ObjectId(), userId: new mongoose.Types.ObjectId(), status: "pending" };
  const adminId = new mongoose.Types.ObjectId();
  stub(t, LocalAdminApplication, "findOne", () => query(application));
  stub(t, LocalAdminApplication, "findOneAndUpdate", async (filter, update) => {
    assert.equal(filter.status, "pending");
    assert.equal(update.$set.status, "approved");
    return { ...application, ...update.$set };
  });
  let userUpdate;
  stub(t, User, "findOneAndUpdate", async (filter, update) => { userUpdate = { filter, update }; return { _id: application.userId }; });
  let audit;
  stub(t, AuditEvent, "create", async (rows, options) => { audit = { row: rows[0], options }; });
  const res = response();
  await controller.reviewApplication({ user: { role: "admin", userId: String(adminId) }, params: { applicationId: String(application._id) }, body: { action: "approve" } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(userUpdate.filter.accountStatus, "local_admin_pending");
  assert.equal(userUpdate.update.$set.accountStatus, "local_admin_approved");
  assert.equal(audit.row.actorId, String(adminId));
  assert.equal(audit.row.action, "local_admin_application_approved");
  assert.equal(audit.row.resourceId, application._id);
  assert.ok(audit.options.session);
  assert.match(res.body.message, /separate area assignment/);
});

test("reject requires a reason and sets rejected status without granting admin role", async (t) => {
  transactionStub(t);
  let queryCount = 0;
  stub(t, LocalAdminApplication, "findOne", () => { queryCount++; return query({ _id: new mongoose.Types.ObjectId(), userId: new mongoose.Types.ObjectId(), status: "pending" }); });
  const missingReason = response();
  await controller.reviewApplication({ user: { role: "admin", userId: "64c000000000000000000041" }, params: { applicationId: "64c000000000000000000042" }, body: { action: "reject" } }, missingReason);
  assert.equal(missingReason.statusCode, 400);
  assert.equal(queryCount, 0);
});

test("rejection stores reviewer and reason, revokes account access, and audits decision", async (t) => {
  transactionStub(t);
  const application = { _id: new mongoose.Types.ObjectId(), userId: new mongoose.Types.ObjectId(), status: "pending" };
  const adminId = new mongoose.Types.ObjectId();
  stub(t, LocalAdminApplication, "findOne", () => query(application));
  let reviewed;
  stub(t, LocalAdminApplication, "findOneAndUpdate", async (_filter, update) => { reviewed = update.$set; return { ...application, ...update.$set }; });
  let accountUpdate;
  stub(t, User, "findOneAndUpdate", async (_filter, update) => { accountUpdate = update.$set; return { _id: application.userId }; });
  let audit;
  stub(t, AuditEvent, "create", async (rows) => { audit = rows[0]; });
  const res = response();
  await controller.reviewApplication({ user: { role: "admin", userId: String(adminId) }, params: { applicationId: String(application._id) }, body: { action: "reject", reason: "Coverage is not currently available." } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(reviewed.status, "rejected");
  assert.equal(reviewed.reviewedBy, String(adminId));
  assert.equal(reviewed.rejectionReason, "Coverage is not currently available.");
  assert.equal(accountUpdate.accountStatus, "local_admin_rejected");
  assert.equal(audit.action, "local_admin_application_rejected");
  assert.equal(audit.details.reason, "Coverage is not currently available.");
});

test("already reviewed application cannot be approved or rejected again", async (t) => {
  transactionStub(t);
  stub(t, LocalAdminApplication, "findOne", () => query(null));
  const res = response();
  await controller.reviewApplication({ user: { role: "admin", userId: "64c000000000000000000051" }, params: { applicationId: "64c000000000000000000052" }, body: { action: "approve" } }, res);
  assert.equal(res.statusCode, 409);
});

test("area assignment is denied until an application is approved", async (t) => {
  const originalFindById = User.findById;
  const originalExists = LocalAdminApplication.exists;
  const originalCreate = LocalAdminAssignment.create;
  User.findById = () => ({ select: async () => ({ _id: "64c000000000000000000061", role: "user", accountStatus: "active" }) });
  LocalAdminApplication.exists = async () => null;
  LocalAdminAssignment.create = async () => assert.fail("Unapproved applicant must never be assigned");
  t.after(() => { User.findById = originalFindById; LocalAdminApplication.exists = originalExists; LocalAdminAssignment.create = originalCreate; });
  const res = response();
  await recoveryController.createAssignment({ user: { role: "admin", userId: "64c000000000000000000062" }, body: { userId: "64c000000000000000000061", assignedArea: "North" } }, res);
  assert.equal(res.statusCode, 409);
});

test("approved applicant can receive only an explicit audited area assignment", async (t) => {
  transactionStub(t);
  const userId = "64c000000000000000000071";
  const adminId = "64c000000000000000000072";
  stub(t, User, "findById", () => ({ select: async () => ({ _id: userId, role: "user", accountStatus: "local_admin_approved" }) }));
  stub(t, LocalAdminApplication, "exists", async () => ({ _id: "64c000000000000000000073" }));
  stub(t, LocalAdminAssignment, "findOne", async () => null);
  let created;
  stub(t, LocalAdminAssignment, "create", async (rows, options) => { created = rows[0]; assert.ok(options.session); return [{ _id: "64c000000000000000000074", ...created }]; });
  let audit;
  stub(t, AuditEvent, "create", async (rows) => { audit = rows[0]; });
  const res = response();
  await recoveryController.createAssignment({ user: { role: "admin", userId: adminId }, body: { userId, assignedArea: "North" } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(created.userId, userId);
  assert.equal(created.assignedArea, "North");
  assert.equal(audit.actorId, adminId);
  assert.equal(audit.action, "local_admin_assignment_created");
});

test("Local Admin area endpoint returns only the caller's active assignments", async (t) => {
  let filter;
  stub(t, LocalAdminAssignment, "find", (queryFilter) => {
    filter = queryFilter;
    const result = [{ _id: "assignment-1", assignedArea: "North", assignedAt: new Date("2026-01-01T00:00:00Z") }];
    return { select() { return this; }, sort() { return this; }, then(resolve, reject) { return Promise.resolve(result).then(resolve, reject); } };
  });
  const res = response();
  await recoveryController.getMyLocalAdminAssignments({ user: { userId: "64c000000000000000000081" } }, res);
  assert.deepEqual(filter, { userId: "64c000000000000000000081", isActive: true });
  assert.equal(res.statusCode, 200);
  assert.deepEqual(res.body.data.map((row) => row.assignedArea), ["North"]);
});
