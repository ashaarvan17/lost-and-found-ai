const QUESTION_COUNTS = Object.freeze({
  low: 3,
  intermediate: 5,
  high: 5,
});

function readPositiveInteger(env, name, fallback) {
  const raw = env[name];
  if (raw === undefined || raw === "") return fallback;
  const parsed = Number(raw);
  if (!Number.isInteger(parsed) || parsed < 1) {
    throw new Error(`${name} must be a positive integer`);
  }
  return parsed;
}

function getOwnershipVerificationSettings(env = process.env) {
  const settings = {
    questionCounts: QUESTION_COUNTS,
    requiredCorrect: {
      low: readPositiveInteger(env, "OWNERSHIP_LOW_REQUIRED_CORRECT", 2),
      intermediate: readPositiveInteger(env, "OWNERSHIP_INTERMEDIATE_REQUIRED_CORRECT", 4),
      high: readPositiveInteger(env, "OWNERSHIP_HIGH_REQUIRED_CORRECT", 5),
    },
    maxAttempts: readPositiveInteger(env, "OWNERSHIP_MAX_ATTEMPTS", 3),
    lockoutHours: readPositiveInteger(env, "OWNERSHIP_LOCKOUT_HOURS", 24),
  };

  for (const [tier, count] of Object.entries(QUESTION_COUNTS)) {
    if (settings.requiredCorrect[tier] > count) {
      throw new Error(`Required correct answers for ${tier} cannot exceed ${count}`);
    }
  }
  return settings;
}

module.exports = { getOwnershipVerificationSettings };
