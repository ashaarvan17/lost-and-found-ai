const { getOwnershipVerificationSettings } = require("./ownershipVerification");
function getItemValueTierSettings(env = process.env) {
  const lowMaxInr = Number(env.ITEM_VALUE_LOW_MAX_INR ?? 2000);
  const intermediateMaxInr = Number(env.ITEM_VALUE_INTERMEDIATE_MAX_INR ?? 10000);
  if (!Number.isSafeInteger(lowMaxInr) || lowMaxInr < 0 || !Number.isSafeInteger(intermediateMaxInr) || intermediateMaxInr <= lowMaxInr) throw new Error("Invalid item value tier thresholds");
  return { lowMaxInr, intermediateMaxInr };
}
function parseEstimatedValue(value) {
  if ((typeof value !== "number" && typeof value !== "string") || String(value).trim() === "") return null;
  const parsed = Number(value);
  return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : null;
}
function assignValueTier(value, env = process.env) {
  const amount = parseEstimatedValue(value);
  if (amount === null) return null;
  const { lowMaxInr, intermediateMaxInr } = getItemValueTierSettings(env);
  return amount <= lowMaxInr ? "low" : amount <= intermediateMaxInr ? "intermediate" : "high";
}
function getQuestionCount(tier, env = process.env) { return getOwnershipVerificationSettings(env).questionCounts[tier] || null; }
module.exports = { getItemValueTierSettings, parseEstimatedValue, assignValueTier, getQuestionCount };
