const fs = require("node:fs");
const path = require("node:path");
const dotenv = require("dotenv");

function parseMongoUri(uri) {
  let parsed;
  try { parsed = new URL(uri); }
  catch { throw new Error("MongoDB test URI must be a valid MongoDB connection URI."); }
  if (!["mongodb:", "mongodb+srv:"].includes(parsed.protocol)) throw new Error("MongoDB test URI must use mongodb or mongodb+srv.");
  const databaseName = decodeURIComponent(parsed.pathname.replace(/^\//, ""));
  if (!databaseName.endsWith("_test")) throw new Error("MongoDB test database name must end exactly in _test.");
  return { parsed, databaseName };
}

function localHost(hostname) {
  return ["localhost", "127.0.0.1", "::1"].includes(hostname.toLowerCase());
}

function existingApplicationMongoUri(env) {
  if (env.MONGODB_URI) return env.MONGODB_URI;
  const envPath = path.resolve(__dirname, "..", ".env");
  if (!fs.existsSync(envPath)) return "";
  return dotenv.parse(fs.readFileSync(envPath)).MONGODB_URI || "";
}

function assertTestDatabaseUri(uri, env = process.env) {
  const { parsed, databaseName } = parseMongoUri(uri);
  if (localHost(parsed.hostname)) return { databaseName, host: parsed.hostname, isRemote: false };

  if (env.MONGODB_TEST_ALLOW_REMOTE !== "true" || !env.MONGODB_TEST_HOST || parsed.hostname.toLowerCase() !== env.MONGODB_TEST_HOST.toLowerCase()) {
    throw new Error("Remote test databases require MONGODB_TEST_ALLOW_REMOTE=true and an exact MONGODB_TEST_HOST allowlist.");
  }
  const applicationUri = existingApplicationMongoUri(env);
  if (applicationUri) {
    try {
      const appHost = new URL(applicationUri).hostname.toLowerCase();
      if (!localHost(appHost) && appHost === parsed.hostname.toLowerCase()) {
        throw new Error("MongoDB test host must be separate from the configured application database host.");
      }
    } catch (error) {
      if (error.message.startsWith("MongoDB test host")) throw error;
      throw new Error("Configured MONGODB_URI is invalid; cannot prove test-cluster isolation.");
    }
  }
  return { databaseName, host: parsed.hostname, isRemote: true };
}

module.exports = { assertTestDatabaseUri, parseMongoUri };
