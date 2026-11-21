const { randomBytes, scrypt, timingSafeEqual } = require("node:crypto");
const { promisify } = require("node:util");
const { getOwnershipVerificationSettings } = require("../config/ownershipVerification");

const scryptAsync = promisify(scrypt);

const ANSWER_HASH_BYTES = 32;
const ANSWER_SALT_BYTES = 16;
const MAX_ANSWER_LENGTH = 1000;

function normalizeAnswer(answer) {
  if (typeof answer !== "string" || answer.length > MAX_ANSWER_LENGTH) {
    throw new TypeError("Answers must be strings of at most 1000 characters");
  }
  return answer
    .normalize("NFKC")
    .toLowerCase()
    .replace(/\p{P}+/gu, " ")
    .replace(/\s+/gu, " ")
    .trim();
}

async function createAnswerVerifier(answer) {
  const normalized = normalizeAnswer(answer);
  if (!normalized) throw new TypeError("Expected answers cannot be empty");
  const salt = randomBytes(ANSWER_SALT_BYTES);
  const hash = await scryptAsync(normalized, salt, ANSWER_HASH_BYTES);
  return { salt: salt.toString("base64"), hash: hash.toString("base64") };
}

async function answerMatches(verifier, submittedAnswer) {
  if (!verifier || typeof verifier.salt !== "string" || typeof verifier.hash !== "string") {
    throw new TypeError("Invalid stored answer verifier");
  }
  const salt = Buffer.from(verifier.salt, "base64");
  const expectedHash = Buffer.from(verifier.hash, "base64");
  if (salt.length !== ANSWER_SALT_BYTES || expectedHash.length !== ANSWER_HASH_BYTES) {
    throw new TypeError("Invalid stored answer verifier");
  }
  const normalized = normalizeAnswer(submittedAnswer);
  if (!normalized) return false;
  const submittedHash = await scryptAsync(normalized, salt, ANSWER_HASH_BYTES);
  return timingSafeEqual(expectedHash, submittedHash);
}

/**
 * Evaluate one claim attempt. Persist the returned transition atomically with
 * the claim; do not send per-answer results or hashes to the claimant.
 */
async function evaluateVerificationAttempt({
  valueTier,
  expectedAnswerVerifiers,
  submittedAnswers,
  failedAttempts = 0,
  now = new Date(),
  settings = getOwnershipVerificationSettings(),
}) {
  const questionCount = settings.questionCounts[valueTier];
  if (!questionCount) throw new TypeError("Invalid trusted value tier");
  if (!Array.isArray(expectedAnswerVerifiers) || expectedAnswerVerifiers.length !== questionCount) {
    throw new TypeError("Expected answers do not match the configured question count");
  }
  if (!Array.isArray(submittedAnswers) || submittedAnswers.length !== questionCount) {
    throw new TypeError("Submitted answers do not match the question count");
  }
  if (!Number.isInteger(failedAttempts) || failedAttempts < 0) {
    throw new TypeError("Invalid failed attempt count");
  }
  if (failedAttempts >= settings.maxAttempts) {
    return {
      allowed: false,
      passed: false,
      status: "review_required",
      escalationRequired: true,
      attemptsRemaining: 0,
    };
  }

  const comparisons = await Promise.all(expectedAnswerVerifiers.map(
    (verifier, index) => answerMatches(verifier, submittedAnswers[index]),
  ));
  const correctCount = comparisons.filter(Boolean).length;

  const passed = correctCount >= settings.requiredCorrect[valueTier];
  if (passed) {
    return {
      allowed: true,
      passed: true,
      status: "verified",
      escalationRequired: false,
      failedAttempts,
      attemptsRemaining: settings.maxAttempts - failedAttempts - 1,
    };
  }

  const attemptsUsed = failedAttempts + 1;
  const exhausted = attemptsUsed >= settings.maxAttempts;
  return {
    allowed: true,
    passed: false,
    status: exhausted ? "review_required" : "verification_failed",
    escalationRequired: exhausted,
    failedAttempts: attemptsUsed,
    attemptsRemaining: Math.max(0, settings.maxAttempts - attemptsUsed),
    ...(exhausted
      ? { lockedUntil: new Date(now.getTime() + settings.lockoutHours * 60 * 60 * 1000) }
      : {}),
  };
}

module.exports = {
  normalizeAnswer,
  createAnswerVerifier,
  evaluateVerificationAttempt,
};
