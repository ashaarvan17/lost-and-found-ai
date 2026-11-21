const assert = require("node:assert/strict");
const test = require("node:test");
const mongoose = require("mongoose");
const Claim = require("../src/models/Claim");
const ItemReport = require("../src/models/ItemReport");
const LocalAdminAssignment = require("../src/models/LocalAdminAssignment");
const RecoveryTransaction = require("../src/models/RecoveryTransaction");
const AuditEvent = require("../src/models/AuditEvent");
const controller = require("../src/controllers/recoveryController");
const { hashOtp } = require("../src/services/recoveryOtp");

function response() { return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }
function stub(t, obj, key, fn) { const old = obj[key]; obj[key] = fn; t.after(() => { obj[key] = old; }); }
function sessionStubs(t) { stub(t, mongoose, "startSession", async () => ({ withTransaction: async (fn) => fn(), endSession: async () => {} })); }
function txnQuery(txn) { return { select: async () => txn }; }
function sessionQuery(value) { return { session() { return this; }, then(resolve, reject) { return Promise.resolve(value).then(resolve, reject); } }; }

test("malformed recovery resource IDs and missing OTP bodies return 400 before database access", async () => {
  const cases = [
    [controller.updateAssignment, { params: { assignmentId: "bad-id" }, body: { action: "revoke" }, user: { role: "admin" } }],
    [controller.getAvailableAssignmentsForReport, { params: { reportId: "bad-id" }, user: { userId: "user" } }],
    [controller.createPersonalHandover, { params: { claimId: "bad-id" }, user: { userId: "user" } }],
    [controller.createDeposit, { params: { reportId: "bad-id" }, body: { assignmentId: "507f1f77bcf86cd799439011" }, user: { userId: "user" } }],
    [controller.createCollection, { params: { claimId: "bad-id" }, user: { userId: "user" } }],
    [controller.getClaimTransactions, { params: { claimId: "bad-id" }, user: { userId: "user" } }],
    [controller.getReportTransactions, { params: { reportId: "bad-id" }, user: { userId: "user" } }],
    [controller.getAvailableAssignmentsForClaim, { params: { claimId: "bad-id" }, user: { userId: "user" } }],
    [controller.generateOtp, { params: { transactionId: "bad-id" }, user: { userId: "user" } }],
    [controller.validateOtp, { params: { transactionId: "bad-id" }, body: {}, user: { userId: "user" } }],
  ];

  for (const [handler, req] of cases) {
    const res = response();
    await handler(req, res);
    assert.equal(res.statusCode, 400);
    assert.equal(res.body.success, false);
  }

  const missingOtpBody = response();
  await controller.validateOtp({ params: { transactionId: "507f1f77bcf86cd799439011" }, user: { userId: "user" } }, missingOtpBody);
  assert.equal(missingOtpBody.statusCode, 400);
  assert.match(missingOtpBody.body.message, /six-digit OTP/);
});

test("OTP issuer and validator are restricted to the participants and assigned Local Admin", async (t) => {
  sessionStubs(t);
  const tx = { _id: "tx", purpose: "personal_handover", status: "pending", claimantId: "owner", finderId: "finder", itemId: "item", otpGeneration: 0, otpGenerationCount: 0, otpAttemptCount: 0 };
  stub(t, RecoveryTransaction, "findById", () => txnQuery(tx));
  let updated = false;
  stub(t, RecoveryTransaction, "findOneAndUpdate", async () => { updated = true; return tx; });
  const deniedIssue = response();
  await controller.generateOtp({ params: { transactionId: "507f1f77bcf86cd799439011" }, user: { userId: "stranger" } }, deniedIssue);
  assert.equal(deniedIssue.statusCode, 403);
  assert.equal(updated, false);
  tx.purpose = "local_admin_deposit"; tx.localAdminId = "local-admin"; tx.localAdminAssignmentId = "assignment"; tx.area = "North";
  stub(t, LocalAdminAssignment, "findOne", () => sessionQuery({ userId: "local-admin", assignedArea: "North", isActive: true }));
  const deniedValidator = response();
  await controller.validateOtp({ params: { transactionId: "507f1f77bcf86cd799439011" }, body: { otp: "123456" }, user: { userId: "finder" } }, deniedValidator);
  assert.equal(deniedValidator.statusCode, 403);
});

test("OTP regeneration uses salted hashes, enforces cooldown and generation limits", async (t) => {
  sessionStubs(t);
  const tx = { _id: "tx-gen", purpose: "personal_handover", status: "pending", claimantId: "owner", finderId: "finder", itemId: "item", claimId: "claim", area: "North", otpGeneration: 0, otpGenerationCount: 0, otpAttemptCount: 0 };
  stub(t, RecoveryTransaction, "findById", () => txnQuery(tx));
  stub(t, Claim, "findOne", () => sessionQuery({ status: "verified" }));
  stub(t, Claim, "updateOne", async () => ({ matchedCount: 1 }));
  stub(t, ItemReport, "findOne", async () => ({ custodyStatus: "with_finder" }));
  let update;
  stub(t, RecoveryTransaction, "findOneAndUpdate", async (_filter, changes) => {
    update = changes; Object.assign(tx, changes.$set); tx.otpGeneration += changes.$inc.otpGeneration; tx.otpGenerationCount += changes.$inc.otpGenerationCount; return tx;
  });
  stub(t, AuditEvent, "create", async () => {});
  const first = response();
  await controller.generateOtp({ params: { transactionId: "507f1f77bcf86cd799439011" }, user: { userId: "owner" } }, first);
  assert.equal(first.statusCode, 200);
  assert.match(first.body.data.otp, /^\d{6}$/);
  assert.notEqual(update.$set.otpVerifier.hash, first.body.data.otp);
  assert.ok(update.$set.otpVerifier.salt);
  const cooldown = response();
  await controller.generateOtp({ params: { transactionId: "507f1f77bcf86cd799439011" }, user: { userId: "owner" } }, cooldown);
  assert.equal(cooldown.statusCode, 429);
  tx.otpIssuedAt = new Date(Date.now() - 61_000); tx.otpGenerationCount = 3;
  const limit = response();
  await controller.generateOtp({ params: { transactionId: "507f1f77bcf86cd799439011" }, user: { userId: "owner" } }, limit);
  assert.equal(limit.statusCode, 429);
});

test("expired OTP is rejected without custody change and an incorrect-attempt limit locks validation", async (t) => {
  sessionStubs(t);
  const tx = { _id: "tx", purpose: "local_admin_deposit", status: "otp_issued", finderId: "finder", localAdminId: "admin", localAdminAssignmentId: "assignment", area: "North", itemId: "item", otpGeneration: 1, otpAttemptCount: 0, otpConsumedAt: null, otpVerifier: await hashOtp("111111"), otpExpiresAt: new Date(Date.now() - 1000) };
  stub(t, RecoveryTransaction, "findById", () => txnQuery(tx));
  stub(t, LocalAdminAssignment, "findOne", () => sessionQuery({ userId: "admin", assignedArea: "North", isActive: true }));
  let custodyWrites = 0; let rejectionEvents = [];
  stub(t, RecoveryTransaction, "updateOne", async (_filter, update) => { rejectionEvents.push(update.$push.events.type); });
  stub(t, ItemReport, "findOneAndUpdate", async () => { custodyWrites++; });
  stub(t, AuditEvent, "create", async () => {});
  const expired = response();
  await controller.validateOtp({ params: { transactionId: "507f1f77bcf86cd799439011" }, body: { otp: "111111" }, user: { userId: "admin" } }, expired);
  assert.equal(expired.statusCode, 410);
  assert.equal(custodyWrites, 0);
  assert.deepEqual(rejectionEvents, ["otp_expired"]);

  tx.otpExpiresAt = new Date(Date.now() + 60_000); tx.otpAttemptCount = 0;
  let changes = [];
  stub(t, RecoveryTransaction, "findOneAndUpdate", async (_filter, update) => { changes.push(update); tx.otpAttemptCount++; if (update.$set?.otpLockedUntil) tx.otpLockedUntil = update.$set.otpLockedUntil; return tx; });
  for (let i = 1; i <= 5; i++) {
    const res = response();
    await controller.validateOtp({ params: { transactionId: "507f1f77bcf86cd799439011" }, body: { otp: "222222" }, user: { userId: "admin" } }, res);
    assert.equal(res.statusCode, i === 5 ? 423 : 400);
  }
  assert.equal(changes.length, 5);
  assert.ok(tx.otpLockedUntil > new Date());
  assert.equal(custodyWrites, 0);
  tx.otpLockedUntil = new Date(Date.now() - 1000);
  const exhausted = response();
  await controller.validateOtp({ params: { transactionId: "507f1f77bcf86cd799439011" }, body: { otp: "222222" }, user: { userId: "admin" } }, exhausted);
  assert.equal(exhausted.statusCode, 423);
  assert.equal(changes.length, 5);
});

test("single-use validation completes custody atomically and replay is rejected", async (t) => {
  sessionStubs(t);
  const otp = "345678";
  const tx = { _id: "tx", claimId: "claim", purpose: "local_admin_deposit", status: "otp_issued", finderId: "finder", claimantId: null, localAdminId: "admin", localAdminAssignmentId: "assignment", area: "North", itemId: "item", otpGeneration: 1, otpAttemptCount: 0, otpConsumedAt: null, otpVerifier: await hashOtp(otp), otpExpiresAt: new Date(Date.now() + 60_000), otpLockedUntil: null };
  stub(t, RecoveryTransaction, "findById", () => txnQuery(tx));
  stub(t, LocalAdminAssignment, "findOne", () => sessionQuery({ userId: "admin", assignedArea: "North", isActive: true }));
  stub(t, LocalAdminAssignment, "updateOne", async () => ({ matchedCount: 1 }));
  stub(t, Claim, "findOne", () => sessionQuery({ status: "verified" }));
  stub(t, Claim, "updateOne", async () => ({ matchedCount: 1 }));
  let custodyFilter; let audits = [];
  stub(t, RecoveryTransaction, "findOneAndUpdate", async (_filter, update) => { tx.status = update.$set.status; tx.otpConsumedAt = update.$set.otpConsumedAt; return tx; });
  stub(t, RecoveryTransaction, "updateOne", async () => ({}));
  stub(t, ItemReport, "findOneAndUpdate", async (filter) => { custodyFilter = filter; return { _id: "item" }; });
  stub(t, AuditEvent, "create", async (events) => { audits.push(...events); });
  const success = response();
  await controller.validateOtp({ params: { transactionId: "507f1f77bcf86cd799439011" }, body: { otp }, user: { userId: "admin" } }, success);
  assert.equal(success.statusCode, 200);
  assert.equal(tx.status, "completed");
  assert.equal(custodyFilter.custodyStatus.$in.includes("with_finder"), true);
  assert.ok(audits.some((event) => event.action === "recovery_local_admin_deposit_completed"));
  const replay = response();
  await controller.validateOtp({ params: { transactionId: "507f1f77bcf86cd799439011" }, body: { otp }, user: { userId: "admin" } }, replay);
  assert.equal(replay.statusCode, 409);
});

test("personal handover and Local Admin collection complete only through their own authorized validators", async (t) => {
  sessionStubs(t);
  let current; const audits = [];
  stub(t, RecoveryTransaction, "findById", () => txnQuery(current));
  stub(t, RecoveryTransaction, "findOneAndUpdate", async (_filter, update) => { current.status = update.$set.status; current.otpConsumedAt = update.$set.otpConsumedAt; return current; });
  stub(t, Claim, "findOne", () => sessionQuery({ status: "verified", lostReportId: "lost-item", foundReportId: "item" }));
  stub(t, Claim, "updateOne", async () => ({ matchedCount: 1 }));
  stub(t, LocalAdminAssignment, "findOne", () => sessionQuery({ userId: "assigned-admin", assignedArea: "North", isActive: true }));
  stub(t, LocalAdminAssignment, "updateOne", async () => ({ matchedCount: 1 }));
  const reportTransitions = [];
  stub(t, ItemReport, "findOneAndUpdate", async (filter, update) => {
    reportTransitions.push({ filter, update });
    return { _id: filter.type === "lost" ? "lost-item" : "item" };
  });
  stub(t, AuditEvent, "create", async (events) => { audits.push(...events); });
  for (const scenario of [
    { purpose: "personal_handover", validatorId: "finder", claimantId: "owner", finderId: "finder", localAdminId: null, localAdminAssignmentId: null },
    { purpose: "local_admin_collection", validatorId: "assigned-admin", claimantId: "owner", finderId: "finder", localAdminId: "assigned-admin", localAdminAssignmentId: "assignment" },
  ]) {
    const transitionStart = reportTransitions.length;
    current = { _id: scenario.purpose, claimId: "claim", itemId: "item", purpose: scenario.purpose, status: "otp_issued", claimantId: scenario.claimantId, finderId: scenario.finderId, localAdminId: scenario.localAdminId, localAdminAssignmentId: scenario.localAdminAssignmentId, area: "North", otpGeneration: 1, otpAttemptCount: 0, otpConsumedAt: null, otpVerifier: await hashOtp("987654"), otpExpiresAt: new Date(Date.now() + 60_000) };
    const res = response();
    await controller.validateOtp({ params: { transactionId: "507f1f77bcf86cd799439011" }, body: { otp: "987654" }, user: { userId: scenario.validatorId } }, res);
    assert.equal(res.statusCode, 200, scenario.purpose);
    assert.equal(current.status, "completed");
    const transitions = reportTransitions.slice(transitionStart);
    assert.ok(transitions.some(({ filter, update }) => filter.type === "found" && update.$set.status === "resolved"));
    assert.ok(transitions.some(({ filter, update }) => filter.type === "lost" && filter.status === "active" && update.$set.status === "resolved"));
    assert.ok(audits.some((event) => event.action === `recovery_${scenario.purpose}_completed`));
  }
});

test("concurrent validations have one winner and only one custody transition", async (t) => {
  sessionStubs(t);
  const tx = { _id: "race", claimId: "claim", itemId: "item", purpose: "personal_handover", status: "otp_issued", claimantId: "owner", finderId: "finder", area: "North", otpGeneration: 1, otpAttemptCount: 0, otpConsumedAt: null, otpVerifier: await hashOtp("456789"), otpExpiresAt: new Date(Date.now() + 60_000) };
  stub(t, RecoveryTransaction, "findById", () => txnQuery(tx));
  stub(t, Claim, "findOne", () => sessionQuery({ status: "verified", lostReportId: "lost-item", foundReportId: "item" }));
  stub(t, Claim, "updateOne", async () => ({ matchedCount: 1 }));
  stub(t, RecoveryTransaction, "findOneAndUpdate", async () => {
    if (tx.status !== "otp_issued" || tx.otpConsumedAt) return null;
    tx.status = "completed"; tx.otpConsumedAt = new Date(); return tx;
  });
  let custodyChanges = 0;
  stub(t, ItemReport, "findOneAndUpdate", async (filter) => { if (filter.type === "found") custodyChanges++; return { _id: "item" }; });
  stub(t, AuditEvent, "create", async () => {});
  const invoke = async () => { const res = response(); await controller.validateOtp({ params: { transactionId: "507f1f77bcf86cd799439011" }, body: { otp: "456789" }, user: { userId: "finder" } }, res); return res; };
  const results = await Promise.all([invoke(), invoke()]);
  assert.deepEqual(results.map((res) => res.statusCode).sort(), [200, 409]);
  assert.equal(custodyChanges, 1);
});
