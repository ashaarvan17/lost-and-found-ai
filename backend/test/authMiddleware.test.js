const assert = require("node:assert/strict");
const test = require("node:test");
const jwt = require("jsonwebtoken");
const User = require("../src/models/User");
const LocalAdminAssignment = require("../src/models/LocalAdminAssignment");
const { protect } = require("../src/middleware/authMiddleware");

test("authentication middleware uses current database role instead of stale JWT role", async (t) => {
  const oldSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "middleware-unit-test-secret-".padEnd(40, "x");
  const originalFindById = User.findById;
  const originalAssignmentExists = LocalAdminAssignment.exists;
  t.after(() => { User.findById = originalFindById; LocalAdminAssignment.exists = originalAssignmentExists; process.env.JWT_SECRET = oldSecret; });
  const userId = "64c000000000000000000001";
  User.findById = () => ({ select: async () => ({ _id: userId, role: "user", accountStatus: "active" }) });
  LocalAdminAssignment.exists = async () => null;
  const req = { headers: { authorization: `Bearer ${jwt.sign({ userId, role: "admin" }, process.env.JWT_SECRET)}` } };
  const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  let passed = false;
  await protect(req, res, () => { passed = true; });
  assert.equal(passed, true);
  assert.equal(req.user.role, "user");
  assert.equal(req.user.isLocalAdmin, false);
});

test("authentication middleware blocks pending and rejected application accounts", async (t) => {
  const oldSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "middleware-unit-test-secret-".padEnd(40, "x");
  const originalFindById = User.findById;
  const originalAssignmentExists = LocalAdminAssignment.exists;
  t.after(() => { User.findById = originalFindById; LocalAdminAssignment.exists = originalAssignmentExists; process.env.JWT_SECRET = oldSecret; });
  for (const accountStatus of ["local_admin_pending", "local_admin_rejected"]) {
    const userId = accountStatus === "local_admin_pending" ? "64c000000000000000000011" : "64c000000000000000000012";
    User.findById = () => ({ select: async () => ({ _id: userId, role: "user", accountStatus }) });
    const req = { headers: { authorization: `Bearer ${jwt.sign({ userId }, process.env.JWT_SECRET)}` } };
    const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
    await protect(req, res, () => assert.fail("Unapproved applicants must not receive a session"));
    assert.equal(res.statusCode, 403);
  }
});

test("authentication middleware marks only active area-assigned accounts as Local Admin", async (t) => {
  const oldSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "middleware-unit-test-secret-".padEnd(40, "x");
  const originalFindById = User.findById;
  const originalAssignmentExists = LocalAdminAssignment.exists;
  t.after(() => { User.findById = originalFindById; LocalAdminAssignment.exists = originalAssignmentExists; process.env.JWT_SECRET = oldSecret; });
  const userId = "64c000000000000000000013";
  User.findById = () => ({ select: async () => ({ _id: userId, role: "user", accountStatus: "local_admin_approved" }) });
  LocalAdminAssignment.exists = async (filter) => filter.userId === userId && filter.isActive ? { _id: "assignment" } : null;
  const req = { headers: { authorization: `Bearer ${jwt.sign({ userId }, process.env.JWT_SECRET)}` } };
  const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await protect(req, res, () => {});
  assert.equal(req.user.isLocalAdmin, true);
});

test("authentication middleware rejects tokens for deleted accounts", async (t) => {
  const oldSecret = process.env.JWT_SECRET;
  process.env.JWT_SECRET = "middleware-unit-test-secret-".padEnd(40, "x");
  const originalFindById = User.findById;
  t.after(() => { User.findById = originalFindById; process.env.JWT_SECRET = oldSecret; });
  const userId = "64c000000000000000000002";
  User.findById = () => ({ select: async () => null });
  const req = { headers: { authorization: `Bearer ${jwt.sign({ userId, role: "admin" }, process.env.JWT_SECRET)}` } };
  const res = { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } };
  await protect(req, res, () => assert.fail("Deleted account must not be authorized"));
  assert.equal(res.statusCode, 401);
});
