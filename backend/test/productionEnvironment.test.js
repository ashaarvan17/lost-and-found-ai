const assert = require("node:assert/strict");
const test = require("node:test");
const { validateProductionEnvironment, assertProductionEnvironment } = require("../src/config/productionEnvironment");

const validProduction = {
  NODE_ENV: "production",
  JWT_SECRET: "j".repeat(48),
  RATE_LIMIT_HASH_SECRET: "r".repeat(48),
  AI_SERVICE_TOKEN: "a".repeat(48),
  MONGODB_URI: "mongodb+srv://user:password@cluster.mongodb.net/findback_prod?retryWrites=true&w=majority",
  IMAGEKIT_PUBLIC_KEY: "public-value",
  IMAGEKIT_PRIVATE_KEY: "private-value",
  IMAGEKIT_URL_ENDPOINT: "https://ik.imagekit.io/findback",
  AI_SERVICE_URL: "https://ai.internal.findback.test/match-text",
  CORS_ORIGINS: "https://findback.test",
  TRUST_PROXY: "1",
};

test("production configuration accepts explicit HTTPS production endpoints", () => {
  assert.deepEqual(validateProductionEnvironment(validProduction), []);
  assert.doesNotThrow(() => assertProductionEnvironment(validProduction));
});

test("production configuration rejects weak secrets, local databases, and non-HTTPS origins", () => {
  const invalid = {
    ...validProduction,
    JWT_SECRET: "short",
    RATE_LIMIT_HASH_SECRET: "r".repeat(48),
    MONGODB_URI: "mongodb://127.0.0.1:27017/findback_test",
    CORS_ORIGINS: "http://localhost:5173",
  };
  const result = validateProductionEnvironment(invalid);
  assert.ok(result.some((name) => name.startsWith("JWT_SECRET")));
  assert.ok(result.some((name) => name.startsWith("MONGODB_URI")));
  assert.ok(result.some((name) => name.startsWith("CORS_ORIGINS")));
  assert.throws(() => assertProductionEnvironment(invalid), /Production configuration is incomplete/);
});

test("rate-limit buckets never store the raw client IP", () => {
  const { bucketFor } = require("../src/middleware/distributedRateLimit");
  const oldSecret = process.env.RATE_LIMIT_HASH_SECRET;
  process.env.RATE_LIMIT_HASH_SECRET = "unit-test-key-".padEnd(40, "x");
  const bucket = bucketFor("ip:203.0.113.42", "auth", new Date("2026-11-19T00:00:00Z"), 60_000);
  assert.equal(bucket.key.includes("203.0.113.42"), false);
  assert.equal(bucket.bucketStart.toISOString(), "2026-11-19T00:00:00.000Z");
  if (oldSecret === undefined) delete process.env.RATE_LIMIT_HASH_SECRET;
  else process.env.RATE_LIMIT_HASH_SECRET = oldSecret;
});
