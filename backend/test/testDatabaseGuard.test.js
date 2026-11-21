const test = require("node:test");
const assert = require("node:assert/strict");
const { assertTestDatabaseUri, parseMongoUri } = require("../scripts/testDatabaseGuard");

test("test database guard accepts only local _test databases by default", () => {
  assert.equal(assertTestDatabaseUri("mongodb://127.0.0.1:27017/findback_test?replicaSet=rs0").databaseName, "findback_test");
  assert.throws(() => assertTestDatabaseUri("mongodb://127.0.0.1:27017/findback_dev?replicaSet=rs0"), /end exactly in _test/);
  assert.throws(() => assertTestDatabaseUri("mongodb://db.example.com/findback_test"), /exact MONGODB_TEST_HOST allowlist/);
});

test("remote test database requires explicit host allowlist and production-host separation", () => {
  const uri = "mongodb+srv://test.example.com/findback_test";
  const allowed = { MONGODB_TEST_ALLOW_REMOTE: "true", MONGODB_TEST_HOST: "test.example.com", MONGODB_URI: "mongodb+srv://prod.example.com/findback" };
  assert.equal(assertTestDatabaseUri(uri, allowed).isRemote, true);
  assert.throws(() => assertTestDatabaseUri(uri, { ...allowed, MONGODB_URI: "mongodb+srv://test.example.com/findback" }), /separate from the configured application database host/);
  assert.throws(() => assertTestDatabaseUri(uri, { ...allowed, MONGODB_TEST_HOST: "other.example.com" }), /exact MONGODB_TEST_HOST allowlist/);
});

test("Mongo URI parser rejects unsupported schemes and malformed URIs", () => {
  assert.throws(() => parseMongoUri("https://example.com/findback_test"), /mongodb or mongodb\+srv/);
  assert.throws(() => parseMongoUri("not a uri"), /valid MongoDB connection URI/);
});
