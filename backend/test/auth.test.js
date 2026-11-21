const assert = require("node:assert/strict");
const test = require("node:test");
const bcrypt = require("bcrypt");
const User = require("../src/models/User");
const auth = require("../src/controllers/authController");
const mongoose = require("mongoose");
const LocalAdminApplication = require("../src/models/LocalAdminApplication");

function response() { return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }
function stub(t, object, key, implementation) { const original = object[key]; object[key] = implementation; t.after(() => { object[key] = original; }); }

test("registration normalizes email and ignores a client-supplied privileged role", async (t) => {
  let created;
  stub(t, User, "findOne", async () => null);
  stub(t, bcrypt, "hash", async () => "bcrypt-hash");
  stub(t, User, "create", async (data) => { created = data; return { ...data, _id: "user-id", role: "user" }; });
  const res = response();
  await auth.register({ body: { name: "  Alex  ", email: " Alex@Example.com ", password: "correct-horse-123", role: "admin" } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(created.name, "Alex");
  assert.equal(created.email, "alex@example.com");
  assert.equal(Object.hasOwn(created, "role"), false);
  assert.equal(res.body.user.role, "user");
});

test("registration bounds credential fields before database or password-hash work", async (t) => {
  let queried = false;
  stub(t, User, "findOne", async () => { queried = true; return null; });
  const res = response();
  await auth.register({ body: { name: "A", email: "a@example.com", password: "x".repeat(73) } }, res);
  assert.equal(res.statusCode, 400);
  assert.equal(queried, false);
});

test("pending and rejected Local Admin applicants cannot log in, while approved applicants use the ordinary user role", async (t) => {
  const originalFindOne = User.findOne;
  const originalCompare = bcrypt.compare;
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "auth-local-admin-test-secret-".padEnd(40, "x");
  bcrypt.compare = async () => true;
  t.after(() => { User.findOne = originalFindOne; bcrypt.compare = originalCompare; process.env.JWT_SECRET = originalSecret; });
  for (const accountStatus of ["local_admin_pending", "local_admin_rejected"]) {
    User.findOne = async () => ({ _id: "64c000000000000000000021", password: "hashed", accountStatus, role: "user" });
    const res = response();
    await auth.login({ body: { email: "applicant@example.com", password: "valid-password" } }, res);
    assert.equal(res.statusCode, 403);
    assert.equal(res.body.code, accountStatus === "local_admin_pending" ? "LOCAL_ADMIN_PENDING" : "LOCAL_ADMIN_REJECTED");
    assert.equal(res.body.token, undefined);
  }
  User.findOne = async () => ({ _id: "64c000000000000000000022", name: "Approved", email: "approved@example.com", password: "hashed", accountStatus: "local_admin_approved", role: "user" });
  const approved = response();
  await auth.login({ body: { email: "approved@example.com", password: "valid-password" } }, approved);
  assert.equal(approved.statusCode, 200);
  assert.equal(approved.body.user.role, "user");
  assert.equal(approved.body.user.accountStatus, "local_admin_approved");
});

test("dedicated Super Admin login only issues an admin token after password authentication", async (t) => {
  const originalFindOne = User.findOne;
  const originalCompare = bcrypt.compare;
  const originalSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "super-admin-login-test-secret-".padEnd(40, "x");
  bcrypt.compare = async () => true;
  t.after(() => { User.findOne = originalFindOne; bcrypt.compare = originalCompare; process.env.JWT_SECRET = originalSecret; });

  User.findOne = async () => ({ _id: "64c000000000000000000041", password: "hashed", role: "user", accountStatus: "active" });
  const ordinary = response();
  await auth.loginSuperAdmin({ body: { email: "person@example.com", password: "valid-password" } }, ordinary);
  assert.equal(ordinary.statusCode, 401);
  assert.equal(ordinary.body.token, undefined);

  User.findOne = async () => ({ _id: "64c000000000000000000042", name: "Super Admin", email: "superadmin@gmail.com", password: "hashed", role: "admin", accountStatus: "active" });
  const admin = response();
  await auth.loginSuperAdmin({ body: { email: "SuperAdmin@gmail.com", password: "valid-password" } }, admin);
  assert.equal(admin.statusCode, 200);
  assert.equal(admin.body.user.role, "admin");
  assert.ok(admin.body.token);
});

test("Local Admin application creates a pending ordinary account and private application atomically", async (t) => {
  const originalFindOne = User.findOne;
  const originalCreate = User.create;
  const originalAppCreate = LocalAdminApplication.create;
  const originalStartSession = mongoose.startSession;
  const originalHash = bcrypt.hash;
  User.findOne = () => ({ select: async () => null });
  bcrypt.hash = async () => "bcrypt-hash";
  let createdUser;
  let createdApplication;
  let transactionCommitted = false;
  User.create = async (rows, options) => { createdUser = rows[0]; assert.ok(options.session); return [{ _id: "64c000000000000000000031", ...rows[0] }]; };
  LocalAdminApplication.create = async (rows, options) => { createdApplication = rows[0]; assert.ok(options.session); return [{ _id: "64c000000000000000000032", status: "pending", ...rows[0] }]; };
  mongoose.startSession = async () => ({ withTransaction: async (callback) => { await callback(); transactionCommitted = true; }, endSession: async () => {} });
  t.after(() => { User.findOne = originalFindOne; User.create = originalCreate; LocalAdminApplication.create = originalAppCreate; mongoose.startSession = originalStartSession; bcrypt.hash = originalHash; });
  const res = response();
  await auth.applyAsLocalAdmin({ body: { name: "  Alex Applicant ", email: "ALEX@example.com", password: "valid-password", requestedArea: " North Campus ", phone: "", verificationDetails: "Volunteer coordinator", role: "admin" } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(transactionCommitted, true);
  assert.equal(createdUser.role, undefined);
  assert.equal(createdUser.accountStatus, "local_admin_pending");
  assert.equal(createdApplication.requestedArea, "North Campus");
  assert.equal(createdApplication.verificationDetails, "Volunteer coordinator");
  assert.equal(res.body.data.status, "pending");
});

test("public application validation rejects malformed area and never touches persistence", async (t) => {
  const originalStartSession = mongoose.startSession;
  mongoose.startSession = async () => { assert.fail("Invalid request must be rejected before opening a database session"); };
  t.after(() => { mongoose.startSession = originalStartSession; });
  const res = response();
  await auth.applyAsLocalAdmin({ body: { name: "Alex", email: "alex@example.com", password: "valid-password", requestedArea: " " } }, res);
  assert.equal(res.statusCode, 400);
});

test("database schema has a partial unique index for exactly one existing admin role", () => {
  const index = User.schema.indexes().find(([keys, options]) => keys.role === 1 && options.partialFilterExpression?.role === "admin");
  assert.ok(index);
  assert.equal(index[1].unique, true);
});
