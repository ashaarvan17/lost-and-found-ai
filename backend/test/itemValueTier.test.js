const assert = require("node:assert/strict");
const test = require("node:test");
const { parseEstimatedValue, assignValueTier, getQuestionCount, getItemValueTierSettings } = require("../src/config/itemValueTier");

test("INR value tiers use configured inclusive boundaries", () => {
  assert.equal(assignValueTier(0), "low");
  assert.equal(assignValueTier(2000), "low");
  assert.equal(assignValueTier(2001), "intermediate");
  assert.equal(assignValueTier(10000), "intermediate");
  assert.equal(assignValueTier(10001), "high");
  assert.equal(assignValueTier(1500, { ITEM_VALUE_LOW_MAX_INR: "1000", ITEM_VALUE_INTERMEDIATE_MAX_INR: "5000" }), "intermediate");
});

test("invalid estimates are rejected and tier determines required question count", () => {
  for (const value of [undefined, "", -1, 1.5, "NaN", "1.2"]) assert.equal(parseEstimatedValue(value), null);
  assert.equal(getQuestionCount("low"), 3);
  assert.equal(getQuestionCount("intermediate"), 5);
  assert.equal(getQuestionCount("high"), 5);
});

test("bad value threshold configuration fails closed", () => {
  assert.throws(() => getItemValueTierSettings({ ITEM_VALUE_LOW_MAX_INR: "3000", ITEM_VALUE_INTERMEDIATE_MAX_INR: "2000" }));
});
