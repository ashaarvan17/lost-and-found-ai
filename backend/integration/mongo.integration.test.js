const assert = require("node:assert/strict");
const test = require("node:test");
const path = require("node:path");

require("dotenv").config({ path: path.join(__dirname, "..", ".env.test") });
process.env.NODE_ENV = "test";
process.env.JWT_SECRET ||= "phase8-integration-jwt-secret-replace-this-value";
process.env.RATE_LIMIT_HASH_SECRET ||= "phase8-integration-rate-secret-replace-this-value";
process.env.AI_SERVICE_URL ||= "http://127.0.0.1:1/match-text";
process.env.IMAGEKIT_PUBLIC_KEY ||= "test-public-key";
process.env.IMAGEKIT_PRIVATE_KEY ||= "test-private-key";
process.env.IMAGEKIT_URL_ENDPOINT ||= "https://ik.imagekit.io/test-only";

const mongoose = require("mongoose");
const express = require("express");
const app = require("../src/app");
const User = require("../src/models/User");
const ItemReport = require("../src/models/ItemReport");
const MatchCandidate = require("../src/models/MatchCandidate");
const Claim = require("../src/models/Claim");
const Conversation = require("../src/models/Conversation");
const Message = require("../src/models/Message");
const AuditEvent = require("../src/models/AuditEvent");
const LocalAdminAssignment = require("../src/models/LocalAdminAssignment");
const LocalAdminApplication = require("../src/models/LocalAdminApplication");
const RecoveryTransaction = require("../src/models/RecoveryTransaction");
const { distributedRateLimit } = require("../src/middleware/distributedRateLimit");
const { assertTestDatabaseUri } = require("../scripts/testDatabaseGuard");

function closeServer(server) {
  if (!server) return Promise.resolve();
  server.closeAllConnections?.();
  return new Promise((resolve, reject) => server.close((error) => error ? reject(error) : resolve()));
}

async function api(server, route, { method = "GET", token, body } = {}) {
  const response = await fetch(`http://127.0.0.1:${server.address().port}${route}`, {
    method,
    headers: { ...(token ? { Authorization: `Bearer ${token}` } : {}), ...(body ? { "Content-Type": "application/json" } : {}) },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  return { status: response.status, headers: response.headers, body: await response.json().catch(() => null) };
}

async function register(server, name, email) {
  const password = "phase8-test-password-123";
  const created = await api(server, "/api/auth/register", { method: "POST", body: { name, email, password, role: "admin" } });
  assert.equal(created.status, 201, JSON.stringify(created.body));
  const login = await api(server, "/api/auth/login", { method: "POST", body: { email, password } });
  assert.equal(login.status, 200, JSON.stringify(login.body));
  return { id: String(login.body.user.id), token: login.body.token, email, password };
}

function questions(count = 3) {
  return Array.from({ length: count }, (_, i) => ({ prompt: `Distinctive detail ${i + 1}?`, expectedAnswer: `owner detail ${i + 1}` }));
}

async function createReport(server, user, type, title, details = {}) {
  const payload = {
    title,
    description: type === "found" ? "Navy fabric wallet with a silver key holder." : "Navy fabric wallet lost near the station.",
    type,
    category: "Wallet",
    location: "Central Station",
    date: "2026-11-01",
    ...(type === "found" ? { estimatedReplacementValueInr: 2000, valueTier: "high", ownershipQuestions: questions() } : {}),
    ...details,
  };
  const result = await api(server, "/api/reports", { method: "POST", token: user.token, body: payload });
  assert.equal(result.status, 201, JSON.stringify(result.body));
  return result.body.data;
}

test("MongoDB replica-set integration: persistence, auth, privacy, claims, communication, review, rate limits and recovery transactions", async (t) => {
  const uri = process.env.MONGODB_TEST_URI;
  if (!uri) throw new Error("MONGODB_TEST_URI is required; create backend/.env.test from its example first.");
  assertTestDatabaseUri(uri);
  let server;
  let limiterServer;
  try {
    await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
    const hello = await mongoose.connection.db.admin().command({ hello: 1 });
    assert.ok(hello.setName, "MongoDB must be a replica set so transaction tests use real sessions.");
    assert.equal(mongoose.connection.readyState, 1);
    await mongoose.connection.dropDatabase();
    await Promise.all([
      User.init(), ItemReport.init(), MatchCandidate.init(), Claim.init(), Conversation.init(), Message.init(),
      AuditEvent.init(), LocalAdminAssignment.init(), RecoveryTransaction.init(),
      LocalAdminApplication.init(),
      require("../src/models/RateLimitBucket").init(),
    ]);

    server = app.listen(0);
    await new Promise((resolve) => server.once("listening", resolve));

    let ctx;
    await t.test("registration, login, authentication, database role recheck, CRUD, and report privacy", async () => {
      const claimant = await register(server, "Claimant", `claimant-${Date.now()}@example.test`);
      const duplicate = await api(server, "/api/auth/register", { method: "POST", body: { name: "Duplicate", email: claimant.email, password: claimant.password } });
      assert.equal(duplicate.status, 409);
      const wrongLogin = await api(server, "/api/auth/login", { method: "POST", body: { email: claimant.email, password: "wrong-password-123" } });
      assert.equal(wrongLogin.status, 401);
      const identity = await api(server, "/api/auth/me", { token: claimant.token });
      assert.equal(identity.status, 200);
      assert.equal((await User.findById(claimant.id)).role, "user", "Public registration must ignore client-selected admin roles.");

      const finder = await register(server, "Finder", `finder-${Date.now()}@example.test`);
      const lost = await createReport(server, claimant, "lost", "Navy fabric wallet");
      const found = await createReport(server, finder, "found", "Navy fabric wallet");
      assert.equal(found.valueTier, "low", "The server must ignore the submitted high value tier.");
      const persistedFound = await ItemReport.findById(found._id).select("+ownershipQuestions");
      assert.equal(persistedFound.ownershipQuestions.length, 3);
      assert.equal(JSON.stringify(persistedFound.ownershipQuestions).includes("owner detail"), false);

      const publicReports = await api(server, "/api/reports");
      assert.equal(publicReports.status, 200);
      assert.ok(publicReports.body.data.every((report) => report.type === "lost"));
      const anonymousFound = await api(server, `/api/reports/${found._id}`);
      const unrelatedFound = await api(server, `/api/reports/${found._id}`, { token: claimant.token });
      assert.equal(anonymousFound.status, 404);
      assert.equal(unrelatedFound.status, 404);
      const finderReport = await api(server, `/api/reports/${found._id}`, { token: finder.token });
      assert.equal(finderReport.status, 200);
      assert.equal(JSON.stringify(finderReport.body).includes("verifier"), false);
      assert.equal(JSON.stringify(finderReport.body).includes("owner detail"), false);
      assert.equal(String(lost._id).length, 24);

      const admin = await register(server, "Main Admin", `admin-${Date.now()}@example.test`);
      await User.updateOne({ _id: admin.id }, { $set: { role: "admin" } });
      await assert.rejects(User.updateOne({ _id: claimant.id }, { $set: { role: "admin" } }), (error) => error.code === 11000, "The database index must reject a second Super Admin.");
      const staleTokenAssignments = await api(server, "/api/recovery/admin/local-admin-assignments", { token: admin.token });
      assert.equal(staleTokenAssignments.status, 200, "The database role must override the stale role embedded in a JWT.");
      await User.updateOne({ _id: admin.id }, { $set: { role: "user" } });
      const demotedAdmin = await api(server, "/api/recovery/admin/local-admin-assignments", { token: admin.token });
      assert.equal(demotedAdmin.status, 403, "Admin demotion must take effect before token expiry.");
      await User.updateOne({ _id: admin.id }, { $set: { role: "admin" } });

      const localAdminEmail = `local-admin-${Date.now()}@example.test`;
      const localAdminPassword = "phase8-local-admin-password-123";
      const application = await api(server, "/api/auth/register-local-admin", { method: "POST", body: { name: "Local Admin", email: localAdminEmail, password: localAdminPassword, requestedArea: "Central Station", phone: "", verificationDetails: "Transit volunteer" } });
      assert.equal(application.status, 201, JSON.stringify(application.body));
      const nonAdminApplicationList = await api(server, "/api/admin/local-admin-applications", { token: claimant.token });
      assert.equal(nonAdminApplicationList.status, 403);
      const nonAdminDecision = await api(server, `/api/admin/local-admin-applications/${application.body.data.applicationId}/actions`, { method: "POST", token: claimant.token, body: { action: "approve" } });
      assert.equal(nonAdminDecision.status, 403);
      const pendingLogin = await api(server, "/api/auth/login", { method: "POST", body: { email: localAdminEmail, password: localAdminPassword } });
      assert.equal(pendingLogin.status, 403);
      assert.equal(pendingLogin.body.code, "LOCAL_ADMIN_PENDING");
      const applicationList = await api(server, "/api/admin/local-admin-applications", { token: admin.token });
      const applicant = applicationList.body.data.find((row) => row.applicant.email === localAdminEmail);
      assert.ok(applicant);
      const applicantId = applicant.applicant.id;
      const approval = await api(server, `/api/admin/local-admin-applications/${applicant.id}/actions`, { method: "POST", token: admin.token, body: { action: "approve" } });
      assert.equal(approval.status, 200, JSON.stringify(approval.body));
      assert.ok(await AuditEvent.findOne({ action: "local_admin_application_approved", actorId: admin.id }));
      const approvedLogin = await api(server, "/api/auth/login", { method: "POST", body: { email: localAdminEmail, password: localAdminPassword } });
      assert.equal(approvedLogin.status, 200);
      assert.equal(approvedLogin.body.user.role, "user", "Approval does not create a global Local Admin role.");
      const localAdmin = { id: applicantId, token: approvedLogin.body.token, email: localAdminEmail, password: localAdminPassword };
      const deniedAssignment = await api(server, "/api/recovery/admin/local-admin-assignments", { method: "POST", token: claimant.token, body: { userId: localAdmin.id, assignedArea: "Central Station" } });
      assert.equal(deniedAssignment.status, 403);
      const assignmentResponse = await api(server, "/api/recovery/admin/local-admin-assignments", { method: "POST", token: admin.token, body: { userId: localAdmin.id, assignedArea: "Central Station" } });
      assert.equal(assignmentResponse.status, 201, JSON.stringify(assignmentResponse.body));
      assert.ok(await AuditEvent.findOne({ action: "local_admin_assignment_created", actorId: admin.id }));
      const ownAreas = await api(server, "/api/recovery/local-admin/assignments", { token: localAdmin.token });
      assert.deepEqual(ownAreas.body.data.map((row) => row.assignedArea), ["Central Station"]);

      const rejectedEmail = `rejected-local-admin-${Date.now()}@example.test`;
      const rejectedApplication = await api(server, "/api/auth/register-local-admin", { method: "POST", body: { name: "Rejected Applicant", email: rejectedEmail, password: localAdminPassword, requestedArea: "North Station" } });
      assert.equal(rejectedApplication.status, 201);
      const rejectedRecord = (await api(server, "/api/admin/local-admin-applications", { token: admin.token })).body.data.find((row) => row.applicant.email === rejectedEmail);
      const rejectedDecision = await api(server, `/api/admin/local-admin-applications/${rejectedRecord.id}/actions`, { method: "POST", token: admin.token, body: { action: "reject", reason: "Area coverage is full." } });
      assert.equal(rejectedDecision.status, 200);
      const rejectedLogin = await api(server, "/api/auth/login", { method: "POST", body: { email: rejectedEmail, password: localAdminPassword } });
      assert.equal(rejectedLogin.status, 403);
      assert.equal(rejectedLogin.body.code, "LOCAL_ADMIN_REJECTED");
      const rejectedAssignment = await api(server, "/api/recovery/admin/local-admin-assignments", { method: "POST", token: admin.token, body: { userId: rejectedRecord.applicant.id, assignedArea: "North Station" } });
      assert.equal(rejectedAssignment.status, 409);

      const stranger = await register(server, "Stranger", `stranger-${Date.now()}@example.test`);
      ctx = { claimant, finder, lost, found, admin, localAdmin, assignment: assignmentResponse.body.data, stranger };
    });

    await t.test("restricted match, immutable question snapshot, persisted verification, and claim communication", async () => {
      const matchResponse = await api(server, "/api/reports/matches/my-matches", { token: ctx.claimant.token });
      assert.equal(matchResponse.status, 200, JSON.stringify(matchResponse.body));
      assert.ok(matchResponse.body.data.length >= 1, "Exact lost/found text should yield a candidate using the safe fallback when AI is offline.");
      const indication = matchResponse.body.data[0];
      assert.equal("foundReportId" in indication, false);
      assert.equal(JSON.stringify(indication).includes("silver key holder"), false);
      const claimResponse = await api(server, `/api/claims/matches/${indication.id}`, { method: "POST", token: ctx.claimant.token });
      assert.equal(claimResponse.status, 200, JSON.stringify(claimResponse.body));
      const claimId = claimResponse.body.data.id;
      assert.equal(claimResponse.body.data.questions.length, 3);
      assert.equal(JSON.stringify(claimResponse.body).includes("hash"), false);
      const storedClaim = await Claim.findById(claimId).select("+questionSnapshot +maxAttempts");
      const verifierSnapshot = storedClaim.questionSnapshot[0].verifier.hash;
      await ItemReport.updateOne({ _id: ctx.found._id }, { $set: { "ownershipQuestions.0.prompt": "changed by later edit" } });
      assert.equal((await Claim.findById(claimId).select("+questionSnapshot")).questionSnapshot[0].verifier.hash, verifierSnapshot);

      const forbiddenVerification = await api(server, `/api/claims/${claimId}/verify`, { method: "POST", token: ctx.stranger.token, body: { answers: ["owner detail 1", "owner detail 2", "owner detail 3"] } });
      assert.equal(forbiddenVerification.status, 404);
      const failed = await api(server, `/api/claims/${claimId}/verify`, { method: "POST", token: ctx.claimant.token, body: { answers: ["wrong", "wrong", "wrong"] } });
      assert.equal(failed.status, 200);
      assert.equal(failed.body.data.verified, false);
      assert.equal("answerResults" in failed.body.data, false);
      const success = await api(server, `/api/claims/${claimId}/verify`, { method: "POST", token: ctx.claimant.token, body: { answers: ["owner detail 1", "owner detail 2", "owner detail 3"] } });
      assert.equal(success.status, 200);
      assert.equal(success.body.data.verified, true);
      const persistedClaim = await Claim.findById(claimId);
      assert.equal(persistedClaim.attemptCount, 2);
      assert.equal(persistedClaim.attempts.length, 2);

      const strangerMessages = await api(server, `/api/claims/${claimId}/messages`, { token: ctx.stranger.token });
      assert.equal(strangerMessages.status, 404);
      const sent = await api(server, `/api/claims/${claimId}/messages`, { method: "POST", token: ctx.claimant.token, body: { body: "I can meet at the station." } });
      assert.equal(sent.status, 201, JSON.stringify(sent.body));
      const finderMessages = await api(server, `/api/claims/${claimId}/messages`, { token: ctx.finder.token });
      assert.equal(finderMessages.status, 200);
      assert.equal(finderMessages.body.data[0].body, "I can meet at the station.");
      assert.equal(await Message.countDocuments({ claimId }), 1);
      ctx.claimId = claimId;
    });

    await t.test("transaction rollback, duplicate handover requests, OTP replay races, and direct handover", async () => {
      const first = await api(server, `/api/recovery/claims/${ctx.claimId}/personal-handover`, { method: "POST", token: ctx.claimant.token });
      assert.equal(first.status, 201, JSON.stringify(first.body));
      const txnId = first.body.data.id;
      const duplicatePair = await Promise.all([
        api(server, `/api/recovery/claims/${ctx.claimId}/personal-handover`, { method: "POST", token: ctx.claimant.token }),
        api(server, `/api/recovery/claims/${ctx.claimId}/personal-handover`, { method: "POST", token: ctx.claimant.token }),
      ]);
      assert.ok(duplicatePair.every((result) => result.status === 409));

      const originalAuditCreate = AuditEvent.create;
      AuditEvent.create = async function (docs, ...args) {
        if (Array.isArray(docs) && docs.some((row) => row.action === "recovery_otp_generated")) throw new Error("Injected audit failure");
        return originalAuditCreate.call(this, docs, ...args);
      };
      try {
        const failedGeneration = await api(server, `/api/recovery/transactions/${txnId}/otp`, { method: "POST", token: ctx.claimant.token });
        assert.equal(failedGeneration.status, 500);
      } finally { AuditEvent.create = originalAuditCreate; }
      const rolledBack = await RecoveryTransaction.findById(txnId).select("+otpVerifier");
      assert.equal(rolledBack.status, "pending");
      assert.equal(rolledBack.otpGenerationCount, 0);
      assert.equal(rolledBack.otpVerifier, undefined);

      const generated = await api(server, `/api/recovery/transactions/${txnId}/otp`, { method: "POST", token: ctx.claimant.token });
      assert.equal(generated.status, 200, JSON.stringify(generated.body));
      assert.match(generated.body.data.otp, /^\d{6}$/);
      const unauthorized = await api(server, `/api/recovery/transactions/${txnId}/validate`, { method: "POST", token: ctx.stranger.token, body: { otp: generated.body.data.otp } });
      assert.equal(unauthorized.status, 403);
      const outcomes = await Promise.all([
        api(server, `/api/recovery/transactions/${txnId}/validate`, { method: "POST", token: ctx.finder.token, body: { otp: generated.body.data.otp } }),
        api(server, `/api/recovery/transactions/${txnId}/validate`, { method: "POST", token: ctx.finder.token, body: { otp: generated.body.data.otp } }),
      ]);
      assert.equal(outcomes.filter((result) => result.status === 200).length, 1);
      assert.ok(outcomes.every((result) => [200, 409].includes(result.status)), JSON.stringify(outcomes.map((item) => item.status)));
      const completed = await RecoveryTransaction.findById(txnId);
      assert.equal(completed.status, "completed");
      assert.equal((await ItemReport.findById(ctx.found._id)).custodyStatus, "with_owner");
      assert.equal((await ItemReport.findById(ctx.found._id)).status, "resolved");
      assert.equal((await ItemReport.findById(ctx.lost._id)).status, "resolved");
      const publicReports = await api(server, "/api/reports");
      assert.equal(publicReports.status, 200);
      assert.equal(publicReports.body.data.find((report) => report._id === String(ctx.lost._id))?.status, "resolved");
      const reporterHistory = await api(server, "/api/reports/my-reports", { token: ctx.claimant.token });
      assert.equal(reporterHistory.status, 200);
      assert.equal(reporterHistory.body.data.find((report) => report._id === String(ctx.lost._id))?.status, "resolved");
      assert.equal(reporterHistory.body.data.find((report) => report._id === String(ctx.found._id))?.status, "resolved");
      assert.ok(await AuditEvent.findOne({ action: "recovery_personal_handover_completed", resourceId: txnId }));
      const replay = await api(server, `/api/recovery/transactions/${txnId}/validate`, { method: "POST", token: ctx.finder.token, body: { otp: generated.body.data.otp } });
      assert.equal(replay.status, 409);
    });

    await t.test("concurrent Local Admin deposit creation, transactional assignment recheck, expiry and custody", async () => {
      const foundForDeposit = await createReport(server, ctx.finder, "found", "Green canvas backpack", { location: "Central Station", estimatedReplacementValueInr: 3000, ownershipQuestions: questions(5) });
      const createDeposit = () => api(server, `/api/recovery/reports/${foundForDeposit._id}/deposit`, { method: "POST", token: ctx.finder.token, body: { assignmentId: ctx.assignment.id } });
      const duplicates = await Promise.all([createDeposit(), createDeposit()]);
      assert.equal(duplicates.filter((result) => result.status === 201).length, 1);
      assert.equal(duplicates.filter((result) => result.status === 409).length, 1, JSON.stringify(duplicates.map((row) => row.status)));
      const txnId = duplicates.find((result) => result.status === 201).body.data.id;

      const originalFindOne = LocalAdminAssignment.findOne;
      const originalUpdateOne = LocalAdminAssignment.updateOne;
      let raced = false;
      LocalAdminAssignment.findOne = function (...args) {
        const query = originalFindOne.apply(this, args);
        // `Model.exists()` in auth middleware is implemented through findOne().
        // Only inject the race at the recovery controller's assignment-ID
        // lookup so the authentication query is not replaced by a Promise.
        const filter = args[0] || {};
        if (!raced && filter._id && String(filter._id) === String(ctx.assignment.id)) {
          raced = true;
          return query.then(async (assignment) => {
            if (assignment) await originalUpdateOne.call(LocalAdminAssignment, { _id: assignment._id }, { $set: { isActive: false } });
            return assignment;
          });
        }
        return query;
      };
      try {
        const racedOtp = await api(server, `/api/recovery/transactions/${txnId}/otp`, { method: "POST", token: ctx.finder.token });
        assert.equal(racedOtp.status, 409, `A revoked assignment between initial authorization and transaction commit must be rejected. Response: ${JSON.stringify(racedOtp.body)}`);
      } finally { LocalAdminAssignment.findOne = originalFindOne; }
      assert.equal((await RecoveryTransaction.findById(txnId)).otpGenerationCount, 0);
      await LocalAdminAssignment.updateOne({ _id: ctx.assignment.id }, { $set: { isActive: true, revokedAt: null } });

      const issued = await api(server, `/api/recovery/transactions/${txnId}/otp`, { method: "POST", token: ctx.finder.token });
      assert.equal(issued.status, 200, JSON.stringify(issued.body));
      await RecoveryTransaction.updateOne({ _id: txnId }, { $set: { otpExpiresAt: new Date(Date.now() - 1000), otpIssuedAt: new Date(Date.now() - 61_000) } });
      const expired = await api(server, `/api/recovery/transactions/${txnId}/validate`, { method: "POST", token: ctx.localAdmin.token, body: { otp: issued.body.data.otp } });
      assert.equal(expired.status, 410);
      assert.equal((await ItemReport.findById(foundForDeposit._id)).custodyStatus, "with_finder");
      await RecoveryTransaction.updateOne({ _id: txnId }, { $set: { otpIssuedAt: new Date(Date.now() - 61_000) } });
      const reissued = await api(server, `/api/recovery/transactions/${txnId}/otp`, { method: "POST", token: ctx.finder.token });
      assert.equal(reissued.status, 200);
      const deposited = await api(server, `/api/recovery/transactions/${txnId}/validate`, { method: "POST", token: ctx.localAdmin.token, body: { otp: reissued.body.data.otp } });
      assert.equal(deposited.status, 200, JSON.stringify(deposited.body));
      const report = await ItemReport.findById(foundForDeposit._id);
      assert.equal(report.custodyStatus, "with_local_admin");
      assert.equal(String(report.custodianUserId), ctx.localAdmin.id);
      assert.equal(String(report.custodianAssignmentId), ctx.assignment.id);
      assert.ok(await AuditEvent.findOne({ action: "recovery_local_admin_deposit_completed", resourceId: txnId }));
      ctx.deposit = { foundForDeposit, txnId };
    });

    await t.test("verified owner collection uses a separate OTP and preserves custody on wrong purpose", async (collectionTest) => {
      if (!ctx.deposit) {
        collectionTest.skip("Depends on the preceding Local Admin deposit test succeeding.");
        return;
      }
      const lostForCollection = await createReport(server, ctx.claimant, "lost", "Green canvas backpack");
      const storedReport = await ItemReport.findById(ctx.deposit.foundForDeposit._id).select("+ownershipQuestions");
      const candidate = await MatchCandidate.create({ lostReportId: lostForCollection._id, foundReportId: storedReport._id });
      const collectionClaim = await Claim.create({
        candidateId: candidate._id, lostReportId: lostForCollection._id, foundReportId: storedReport._id,
        claimantId: ctx.claimant.id, finderId: ctx.finder.id, valueTier: storedReport.valueTier,
        questionSnapshot: storedReport.ownershipQuestions, requiredCorrect: 4, maxAttempts: 3, lockoutHours: 24,
        status: "verified", verifiedAt: new Date(),
      });
      const collection = await api(server, `/api/recovery/claims/${collectionClaim._id}/collection`, { method: "POST", token: ctx.claimant.token });
      assert.equal(collection.status, 201, JSON.stringify(collection.body));
      const collectionTxnId = collection.body.data.id;
      const collectionOtp = await api(server, `/api/recovery/transactions/${collectionTxnId}/otp`, { method: "POST", token: ctx.claimant.token });
      assert.equal(collectionOtp.status, 200, JSON.stringify(collectionOtp.body));
      const oldDepositOtp = await RecoveryTransaction.findById(ctx.deposit.txnId).select("+otpVerifier");
      const crossPurpose = await api(server, `/api/recovery/transactions/${collectionTxnId}/validate`, { method: "POST", token: ctx.localAdmin.token, body: { otp: "000000" === collectionOtp.body.data.otp ? "000001" : "000000" } });
      assert.equal(crossPurpose.status, 400);
      assert.equal((await ItemReport.findById(ctx.deposit.foundForDeposit._id)).custodyStatus, "with_local_admin");
      assert.equal(oldDepositOtp.events.some((event) => Object.hasOwn(event, "otp") || Object.hasOwn(event, "plaintext")), false, "OTP plaintext must never be stored in recovery events.");
      const collected = await api(server, `/api/recovery/transactions/${collectionTxnId}/validate`, { method: "POST", token: ctx.localAdmin.token, body: { otp: collectionOtp.body.data.otp } });
      assert.equal(collected.status, 200, JSON.stringify(collected.body));
      const item = await ItemReport.findById(ctx.deposit.foundForDeposit._id);
      assert.equal(item.custodyStatus, "with_owner");
      assert.equal(item.status, "resolved");
      assert.equal((await ItemReport.findById(lostForCollection._id)).status, "resolved");
      assert.ok(await AuditEvent.findOne({ action: "recovery_local_admin_collection_completed", resourceId: collectionTxnId }));
    });

    await t.test("shared distributed limiter handles concurrent requests across app instances", async () => {
      const limitedApp = express();
      limitedApp.get("/", distributedRateLimit({ namespace: `integration-${Date.now()}`, limit: 3, windowMs: 60_000 }), (req, res) => res.sendStatus(204));
      limiterServer = limitedApp.listen(0);
      await new Promise((resolve) => limiterServer.once("listening", resolve));
      const results = await Promise.all(Array.from({ length: 15 }, () => fetch(`http://127.0.0.1:${limiterServer.address().port}/`)));
      assert.equal(results.filter((response) => response.status === 204).length, 3);
      assert.equal(results.filter((response) => response.status === 429).length, 12);
      assert.ok(results.filter((response) => response.status === 429).every((response) => response.headers.has("retry-after")));
    });

    await t.test("restart and reconnect preserve persisted application data", async () => {
      await closeServer(server);
      server = null;
      await mongoose.disconnect();
      assert.equal(mongoose.connection.readyState, 0);
      await mongoose.connect(uri, { serverSelectionTimeoutMS: 5000 });
      assert.equal(mongoose.connection.readyState, 1);
      assert.ok(await User.findOne({ email: ctx.claimant.email }));
      assert.ok(await ItemReport.findById(ctx.found._id));
      assert.ok(await Claim.findById(ctx.claimId));
      server = app.listen(0);
      await new Promise((resolve) => server.once("listening", resolve));
      const afterRestart = await api(server, "/api/auth/me", { token: ctx.claimant.token });
      assert.equal(afterRestart.status, 200);
      const emptyState = await api(server, "/api/reports/my-reports", { token: ctx.stranger.token });
      assert.equal(emptyState.status, 200);
      assert.deepEqual(emptyState.body.data, []);
    });
  } finally {
    await closeServer(limiterServer).catch(() => {});
    await closeServer(server).catch(() => {});
    if (mongoose.connection.readyState === 1) {
      await mongoose.connection.dropDatabase().catch(() => {});
      await mongoose.disconnect().catch(() => {});
    }
  }
});
