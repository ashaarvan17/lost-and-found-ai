const path = require("node:path");
const { spawnSync } = require("node:child_process");
require("dotenv").config({ path: path.join(__dirname, "..", ".env.test") });
const { assertTestDatabaseUri } = require("./testDatabaseGuard");

const uri = process.env.MONGODB_TEST_URI;
if (!uri) {
  console.error("Integration tests require MONGODB_TEST_URI in backend/.env.test.");
  process.exit(2);
}

try {
  assertTestDatabaseUri(uri);
} catch (error) {
  console.error(error.message);
  process.exit(2);
}
if (!process.env.JWT_SECRET || process.env.JWT_SECRET.length < 32 || !process.env.RATE_LIMIT_HASH_SECRET || process.env.RATE_LIMIT_HASH_SECRET.length < 32) {
  console.error("Set test-only JWT_SECRET and RATE_LIMIT_HASH_SECRET values of at least 32 characters in backend/.env.test.");
  process.exit(2);
}

const result = spawnSync(
  process.execPath,
  [
    "--require",
    path.join(__dirname, "configure-test-dns.js"),
    "--test",
    "integration/mongo.integration.test.js",
  ],
  {
    cwd: path.join(__dirname, ".."),
    stdio: "inherit",
    env: { ...process.env, NODE_ENV: "test" },
  }
);
process.exit(result.status ?? 1);
