const assert = require("node:assert/strict");
const test = require("node:test");
require("dotenv").config({ path: require("node:path").join(__dirname, "..", ".env") });
const Claim = require("../src/models/Claim");
const MatchCandidate = require("../src/models/MatchCandidate");
const ItemReport = require("../src/models/ItemReport");
const AuditEvent = require("../src/models/AuditEvent");
const { createAnswerVerifier } = require("../src/services/ownershipVerification");
const claimController = require("../src/controllers/claimController");
const reportController = require("../src/controllers/itemReportController");

function res() { return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }

test("found-report creation ignores a browser tier and stores salted answer verifiers", async (t) => {
  const originalCreate = ItemReport.create;
  t.after(() => { ItemReport.create = originalCreate; });
  let stored;
  ItemReport.create = async (doc) => { stored = doc; return { ...doc, _id: "found-new" }; };
  const ownershipQuestions = ["mark", "lining", "scratch"].map((prompt) => ({ prompt, expectedAnswer: `secret ${prompt}` }));
  const response = res();
  await reportController.createReport({
    user: { userId: "finder" },
    body: { title: "Wallet", description: "Private", type: "found", category: "Accessories", location: "Station", date: "2026-11-01", estimatedReplacementValueInr: "2000", valueTier: "high", ownershipQuestions },
  }, response);
  assert.equal(response.statusCode, 201);
  assert.equal(stored.valueTier, "low");
  assert.equal(stored.ownershipQuestions.length, 3);
  assert.equal(JSON.stringify(stored).includes("secret mark"), false);
  assert.equal("valueTier" in response.body.data, true);
  assert.equal(JSON.stringify(response.body).includes("hash"), false);
});

test("claim start authorizes the lost reporter and snapshots only private verifiers", async (t) => {
  const originals = [MatchCandidate.findById, ItemReport.findOne, Claim.findOne, Claim.create];
  t.after(() => { [MatchCandidate.findById, ItemReport.findOne, Claim.findOne, Claim.create] = originals; });
  const candidate = { _id: "candidate-1", lostReportId: "lost-1", foundReportId: "found-1" };
  const questions = await Promise.all(["mark red", "inside blue", "small scratch"].map(async (prompt) => ({ prompt, verifier: await createAnswerVerifier(`answer ${prompt}`) })));
  const lost = { _id: "lost-1", userId: "claimant-1" };
  const found = { _id: "found-1", userId: "finder-1", valueTier: "low", ownershipQuestions: questions };
  MatchCandidate.findById = () => ({ select: async () => candidate });
  ItemReport.findOne = (query) => query.type === "lost" ? Promise.resolve(query.userId === "claimant-1" ? lost : null) : ({ select: async () => found });
  Claim.findOne = () => ({ select: async () => null });
  let stored;
  Claim.create = async (doc) => { stored = structuredClone(doc); return { ...doc, _id: "claim-1", attemptCount: 0, status: "questions_issued" }; };

  const denied = res();
  await claimController.beginClaim({ params: { candidateId: "candidate-1" }, user: { userId: "intruder" } }, denied);
  assert.equal(denied.statusCode, 404);
  assert.equal(stored, undefined);

  const accepted = res();
  await claimController.beginClaim({ params: { candidateId: "candidate-1" }, user: { userId: "claimant-1" } }, accepted);
  assert.equal(accepted.statusCode, 200);
  assert.equal(accepted.body.data.questions.length, 3);
  assert.equal(JSON.stringify(accepted.body).includes("salt"), false);
  assert.equal(JSON.stringify(accepted.body).includes("hash"), false);
  const oldHash = stored.questionSnapshot[0].verifier.hash;
  const snapshotPrompt = stored.questionSnapshot[0].prompt;
  found.ownershipQuestions[0].prompt = "edited after claim";
  found.ownershipQuestions[0].verifier.hash = "replacement";
  assert.equal(stored.questionSnapshot[0].prompt, snapshotPrompt);
  assert.equal(stored.questionSnapshot[0].verifier.hash, oldHash);
});

test("three wrong submissions persist attempts, lock out, and escalate without per-answer feedback", async (t) => {
  const originals = [Claim.findOne, Claim.findOneAndUpdate];
  t.after(() => { [Claim.findOne, Claim.findOneAndUpdate] = originals; });
  const verifiers = await Promise.all(["one", "two", "three"].map((answer) => createAnswerVerifier(answer)));
  const persisted = { _id: "claim-2", claimantId: "claimant", valueTier: "low", questionSnapshot: verifiers.map((verifier, i) => ({ prompt: `Question ${i}`, verifier })), requiredCorrect: 2, maxAttempts: 3, lockoutHours: 24, attemptCount: 0, attempts: [], status: "questions_issued" };
  Claim.findOne = (query) => ({ select: async () => query.claimantId === "claimant" ? structuredClone(persisted) : null });
  Claim.findOneAndUpdate = (_filter, update) => ({ select: async () => {
    persisted.status = update.$set.status;
    persisted.attemptCount += update.$inc.attemptCount;
    persisted.lockedUntil = update.$set.lockedUntil;
    persisted.attempts.push(update.$push.attempts);
    return { ...structuredClone(persisted), maxAttempts: 3 };
  } });
  for (let i = 0; i < 3; i++) {
    const response = res();
    await claimController.submitAnswers({ params: { claimId: "claim-2" }, user: { userId: "claimant" }, body: { answers: ["wrong", "wrong", "wrong"] } }, response);
    assert.equal(response.statusCode, 200, JSON.stringify(response.body));
    assert.equal("correctness" in response.body.data, false);
    assert.equal("correctAnswers" in response.body.data, false);
  }
  assert.equal(persisted.attemptCount, 3);
  assert.equal(persisted.status, "review_required");
  assert.ok(Math.abs(persisted.lockedUntil.getTime() - Date.now() - 24 * 60 * 60 * 1000) < 2000);
  assert.equal(persisted.attempts.length, 3);
});

test("admin review queue rejects ordinary users and does not disclose claimant identifiers", async (t) => {
  const originalFind = Claim.find;
  const originalCreate = AuditEvent.create;
  t.after(() => { Claim.find = originalFind; AuditEvent.create = originalCreate; });
  const denied = res();
  await claimController.getReviewQueue({ user: { userId: "user", role: "user" } }, denied);
  assert.equal(denied.statusCode, 403);
  Claim.find = () => ({ select: () => ({ sort: async () => [{ _id: "case-1", status: "review_required", valueTier: "low", attemptCount: 3, createdAt: new Date(), claimantId: "private-user", finderId: "private-finder" }] }) });
  AuditEvent.create = async () => {};
  const allowed = res();
  await claimController.getReviewQueue({ user: { userId: "admin", role: "admin" } }, allowed);
  assert.equal(allowed.statusCode, 200);
  assert.equal(JSON.stringify(allowed.body).includes("private-user"), false);
});

test("ordinary users cannot use the value-tier elevation action", async () => {
  const response = res();
  await reportController.elevateValueTier({ user: { userId: "user", role: "user" }, params: { id: "found" }, body: { valueTier: "high" } }, response);
  assert.equal(response.statusCode, 403);
});
