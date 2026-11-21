const assert = require("node:assert/strict");
const test = require("node:test");
const { generateOtp, hashOtp, verifyOtp } = require("../src/services/recoveryOtp");

test("recovery OTP is six numeric digits and stored as a salted verifier", async () => {
  const otp = generateOtp(6);
  assert.match(otp, /^\d{6}$/);
  const verifier = await hashOtp(otp);
  assert.notEqual(verifier.salt, "");
  assert.notEqual(verifier.hash, otp);
  assert.equal(await verifyOtp(verifier, otp), true);
  assert.equal(await verifyOtp(verifier, "000000"), otp === "000000");
});

test("different challenges receive independent salts and are isolated", async () => {
  const first = await hashOtp("123456");
  const second = await hashOtp("123456");
  assert.notEqual(first.salt, second.salt);
  assert.equal(await verifyOtp(first, "654321"), false);
});
