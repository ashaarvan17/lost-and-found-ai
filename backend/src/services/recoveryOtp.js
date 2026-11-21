const { randomBytes, randomInt, scrypt, timingSafeEqual } = require("node:crypto");
const { promisify } = require("node:util");
const scryptAsync = promisify(scrypt);
const HASH_BYTES = 32;
const SALT_BYTES = 16;
function generateOtp(digits = 6) { return String(randomInt(0, 10 ** digits)).padStart(digits, "0"); }
async function hashOtp(code) {
  const salt = randomBytes(SALT_BYTES);
  const hash = await scryptAsync(code, salt, HASH_BYTES);
  return { salt: salt.toString("base64"), hash: hash.toString("base64") };
}
async function verifyOtp(verifier, code) {
  if (!verifier || typeof verifier.salt !== "string" || typeof verifier.hash !== "string" || typeof code !== "string") return false;
  const salt = Buffer.from(verifier.salt, "base64");
  const expected = Buffer.from(verifier.hash, "base64");
  if (salt.length !== SALT_BYTES || expected.length !== HASH_BYTES) return false;
  const received = await scryptAsync(code, salt, HASH_BYTES);
  return timingSafeEqual(expected, received);
}
module.exports = { generateOtp, hashOtp, verifyOtp };
