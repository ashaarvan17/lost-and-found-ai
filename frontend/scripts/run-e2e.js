import path from "node:path";
import process from "node:process";
import { spawnSync } from "node:child_process";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";

const frontendDir = path.dirname(fileURLToPath(import.meta.url));
const backendDir = path.resolve(frontendDir, "..", "..", "backend");
const require = createRequire(import.meta.url);
require(path.join(backendDir, "node_modules", "dotenv")).config({ path: path.join(backendDir, ".env.test") });
const { assertTestDatabaseUri } = require(path.join(backendDir, "scripts", "testDatabaseGuard.js"));
const dnsHelper = path.join(backendDir, "scripts", "configure-test-dns.js");

const testUri = process.env.MONGODB_TEST_URI;
if (!testUri) {
  console.error("Browser tests require MONGODB_TEST_URI in backend/.env.test.");
  process.exit(2);
}
try { assertTestDatabaseUri(testUri); }
catch (error) { console.error(error.message); process.exit(2); }

const testEnv = {
  ...process.env,
  NODE_ENV: "test",
  MONGODB_TEST_URI: testUri,
  MONGODB_URI: testUri,
  JWT_SECRET: process.env.JWT_SECRET || "e2e-only-jwt-secret-".padEnd(48, "x"),
  RATE_LIMIT_HASH_SECRET: process.env.RATE_LIMIT_HASH_SECRET || "e2e-only-rate-secret-".padEnd(48, "x"),
};

// Clear only the validated test database before the browser journey starts.
const reset = spawnSync(process.execPath, ["--require", dnsHelper, "-e", [
  "const mongoose=require('mongoose');",
  "(async()=>{await mongoose.connect(process.env.MONGODB_TEST_URI,{serverSelectionTimeoutMS:5000});",
  "const hello=await mongoose.connection.db.admin().command({hello:1});",
  "if(!hello.setName)throw new Error('MongoDB replica set is required');",
  "await mongoose.connection.dropDatabase();",
  "const User=require('./src/models/User');const bcrypt=require('bcrypt');await User.init();",
  "await User.create({name:'E2E Super Admin',email:'phase9-super-admin@example.test',password:await bcrypt.hash('Phase9-E2E-admin-password-123',12),role:'admin',accountStatus:'active'});",
  "await require('../frontend/e2e/seed-recovery.cjs')();",
  "await mongoose.disconnect();})().catch(e=>{console.error('Test database preparation failed:',e.message);process.exit(1)});",
].join("")], { cwd: backendDir, stdio: "inherit", env: testEnv });
if (reset.status !== 0) process.exit(reset.status || 1);

const playwrightCli = path.join(frontendDir, "..", "node_modules", "@playwright", "test", "cli.js");
const result = spawnSync(process.execPath, [playwrightCli, "test", ...process.argv.slice(2)], {
  cwd: path.resolve(frontendDir, ".."),
  stdio: "inherit",
  env: testEnv,
});
process.exit(result.status ?? 1);
