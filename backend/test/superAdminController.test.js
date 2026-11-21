const assert = require("node:assert/strict");
const test = require("node:test");
const ItemReport = require("../src/models/ItemReport");
const LocalAdminApplication = require("../src/models/LocalAdminApplication");
const LocalAdminAssignment = require("../src/models/LocalAdminAssignment");
const AuditEvent = require("../src/models/AuditEvent");
const controller = require("../src/controllers/superAdminController");

function response() {
  return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
}

function stub(t, object, key, implementation) {
  const original = object[key];
  object[key] = implementation;
  t.after(() => { object[key] = original; });
}

test("dashboard statistics are database-backed and audited, and reject non-admin users", async (t) => {
  let audit;
  stub(t, AuditEvent, "create", async (events) => { audit = events[0]; });
  const countCalls = [];
  stub(t, ItemReport, "countDocuments", async (filter) => { countCalls.push(filter); return filter.type === "lost" ? 8 : filter.type === "found" ? 7 : 3; });
  stub(t, LocalAdminApplication, "countDocuments", async (filter) => filter.status === "pending" ? 2 : 4);
  stub(t, LocalAdminAssignment, "countDocuments", async (filter) => filter.isActive ? 5 : 0);

  const denied = response();
  await controller.getDashboardStats({ user: { role: "user" } }, denied);
  assert.equal(denied.statusCode, 403);

  const res = response();
  await controller.getDashboardStats({ user: { role: "admin", userId: "admin-id" } }, res);
  assert.deepEqual(res.body.data, { lostReports: 8, foundReports: 7, resolvedReports: 3, pendingApplications: 2, approvedApplications: 4, activeAssignments: 5 });
  assert.deepEqual(countCalls, [{ type: "lost" }, { type: "found" }, { status: "resolved" }]);
  assert.equal(audit.action, "super_admin_dashboard_viewed");
});

test("report views separate active lost/found from resolved and omit private image and ownership data", async (t) => {
  let filter;
  let audit;
  stub(t, ItemReport, "countDocuments", async (query) => { filter = query; return 1; });
  stub(t, AuditEvent, "create", async (events) => { audit = events[0]; });
  const raw = {
    _id: "report-id", title: "Wallet", description: "Brown wallet", type: "found", category: "Personal items",
    location: "Library", date: new Date("2026-01-01"), status: "active", createdAt: new Date("2026-01-02"),
    userId: { _id: "owner-id", name: "Reporter", email: "reporter@example.com" },
    imageUrl: "private-url", imageFileId: "private-file-id", ownershipQuestions: [{ verifier: { hash: "private-hash" } }],
  };
  let selected;
  let queryResult;
  stub(t, ItemReport, "find", (query) => {
    filter = query;
    queryResult = {
      select(fields) { selected = fields; return this; },
      populate() { return this; }, sort() { return this; }, skip() { return this; }, limit() { return this; },
      lean() { return Promise.resolve([raw]); },
    };
    return queryResult;
  });

  for (const [view, expectedFilter] of [
    ["lost", { type: "lost", status: "active" }],
    ["found", { type: "found", status: "active" }],
    ["resolved", { status: "resolved" }],
  ]) {
    const res = response();
    await controller.getReports({ user: { role: "admin", userId: "admin-id" }, query: { view } }, res);
    assert.deepEqual(filter, expectedFilter);
    assert.deepEqual(res.body.data[0].owner, { id: "owner-id", name: "Reporter", email: "reporter@example.com" });
    assert.equal(Object.hasOwn(res.body.data[0], "imageUrl"), false);
    assert.equal(Object.hasOwn(res.body.data[0], "imageFileId"), false);
    assert.equal(Object.hasOwn(res.body.data[0], "ownershipQuestions"), false);
    assert.match(selected, /title description type category location date status createdAt userId/);
    assert.equal(audit.action, "super_admin_reports_viewed");
  }
});

test("report listing rejects non-admin and invalid filters", async (t) => {
  stub(t, ItemReport, "find", () => assert.fail("Unauthorized or invalid requests must not query reports"));
  const denied = response();
  await controller.getReports({ user: { role: "user" }, query: { view: "found" } }, denied);
  assert.equal(denied.statusCode, 403);
  const invalid = response();
  await controller.getReports({ user: { role: "admin" }, query: { view: "everything" } }, invalid);
  assert.equal(invalid.statusCode, 400);
});
