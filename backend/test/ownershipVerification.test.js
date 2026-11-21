const assert = require("node:assert/strict");
const { before, test } = require("node:test");

const {
  createAnswerVerifier,
  evaluateVerificationAttempt,
  normalizeAnswer,
} = require("../src/services/ownershipVerification");
const { getOwnershipVerificationSettings } = require("../src/config/ownershipVerification");

const answers = ["red mark", "two keys", "blue lining", "small scratch", "silver tag"];
let verifiers;
const wrongAnswers = answers.map((_, index) => `incorrect ${index}`);

before(async () => {
  verifiers = await Promise.all(answers.map(createAnswerVerifier));
});

function submittedWithCorrectCount(count) {
  return answers.map((answer, index) => index < count ? answer : `wrong ${index}`);
}

test("verification defaults and thresholds are configurable", () => {
  const settings = getOwnershipVerificationSettings({
    OWNERSHIP_LOW_REQUIRED_CORRECT: "2",
    OWNERSHIP_INTERMEDIATE_REQUIRED_CORRECT: "4",
    OWNERSHIP_HIGH_REQUIRED_CORRECT: "5",
    OWNERSHIP_MAX_ATTEMPTS: "3",
    OWNERSHIP_LOCKOUT_HOURS: "24",
  });
  assert.deepEqual(settings.requiredCorrect, { low: 2, intermediate: 4, high: 5 });
  assert.equal(settings.maxAttempts, 3);
  assert.equal(settings.lockoutHours, 24);
});

test("low and intermediate tiers pass at their configured correct counts", async () => {
  const low = await evaluateVerificationAttempt({
    valueTier: "low",
    expectedAnswerVerifiers: verifiers.slice(0, 3),
    submittedAnswers: submittedWithCorrectCount(2).slice(0, 3),
  });
  const intermediate = await evaluateVerificationAttempt({
    valueTier: "intermediate",
    expectedAnswerVerifiers: verifiers,
    submittedAnswers: submittedWithCorrectCount(4),
  });
  assert.equal(low.passed, true);
  assert.equal(intermediate.passed, true);
  assert.equal("correctCount" in low, false);
});

test("high tier requires all five answers and rejects an incorrect attempt", async () => {
  const result = await evaluateVerificationAttempt({
    valueTier: "high",
    expectedAnswerVerifiers: verifiers,
    submittedAnswers: submittedWithCorrectCount(4),
  });
  assert.equal(result.passed, false);
  assert.equal(result.status, "verification_failed");
  assert.equal(result.attemptsRemaining, 2);
  assert.equal("correctCount" in result, false);
});

test("high tier passes only when all five answers match", async () => {
  const result = await evaluateVerificationAttempt({
    valueTier: "high",
    expectedAnswerVerifiers: verifiers,
    submittedAnswers: answers,
  });
  assert.equal(result.passed, true);
  assert.equal(result.status, "verified");
});

test("answer comparison ignores case, whitespace, and punctuation", async () => {
  const result = await evaluateVerificationAttempt({
    valueTier: "low",
    expectedAnswerVerifiers: verifiers.slice(0, 3),
    submittedAnswers: ["  RED-mark!! ", "TWO   keys", "wrong"],
  });
  assert.equal(normalizeAnswer("  RED-mark!! "), "red mark");
  assert.equal(result.passed, true);
});

test("third failed attempt locks verification and escalates to Main Admin", async () => {
  const now = new Date("2026-11-19T00:00:00.000Z");
  const result = await evaluateVerificationAttempt({
    valueTier: "low",
    expectedAnswerVerifiers: verifiers.slice(0, 3),
    submittedAnswers: wrongAnswers.slice(0, 3),
    failedAttempts: 2,
    now,
  });
  assert.equal(result.status, "review_required");
  assert.equal(result.escalationRequired, true);
  assert.equal(result.attemptsRemaining, 0);
  assert.equal(result.lockedUntil.toISOString(), "2026-11-20T00:00:00.000Z");
});

test("exhausted claims cannot submit another attempt", async () => {
  const result = await evaluateVerificationAttempt({
    valueTier: "low",
    expectedAnswerVerifiers: verifiers.slice(0, 3),
    submittedAnswers: wrongAnswers.slice(0, 3),
    failedAttempts: 3,
  });
  assert.equal(result.allowed, false);
  assert.equal(result.status, "review_required");
});

test("stored answer verifiers do not contain expected answer text", async () => {
  const verifier = await createAnswerVerifier("private owner answer");
  assert.equal(JSON.stringify(verifier).includes("private owner answer"), false);
  assert.equal(Object.keys(verifier).sort().join(","), "hash,salt");
});
