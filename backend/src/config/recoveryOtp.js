function positiveInteger(env, key, fallback, min = 1, max = 1000000) {
  const raw = env[key];
  if (raw === undefined || raw === "") return fallback;
  const value = Number(raw);
  if (!Number.isInteger(value) || value < min || value > max) throw new Error(`${key} must be an integer from ${min} to ${max}`);
  return value;
}
function getRecoveryOtpSettings(env = process.env) {
  return {
    digits: positiveInteger(env, "RECOVERY_OTP_DIGITS", 6, 6, 6),
    validityMinutes: positiveInteger(env, "RECOVERY_OTP_VALIDITY_MINUTES", 10, 1, 60),
    maxIncorrectAttempts: positiveInteger(env, "RECOVERY_OTP_MAX_ATTEMPTS", 5, 1, 20),
    lockoutMinutes: positiveInteger(env, "RECOVERY_OTP_LOCKOUT_MINUTES", 15, 1, 1440),
    resendCooldownSeconds: positiveInteger(env, "RECOVERY_OTP_RESEND_COOLDOWN_SECONDS", 60, 1, 3600),
    maxGenerations: positiveInteger(env, "RECOVERY_OTP_MAX_GENERATIONS", 3, 1, 10),
  };
}
module.exports = { getRecoveryOtpSettings };
