const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const test = require("node:test");
process.env.IMAGEKIT_PUBLIC_KEY ||= "test-public-key";
process.env.IMAGEKIT_PRIVATE_KEY ||= "test-private-key";
process.env.IMAGEKIT_URL_ENDPOINT ||= "https://ik.imagekit.io/test-only";
const app = require("../src/app");

test("health and CORS behavior use a stable safe HTTP contract", async (t) => {
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once("listening", resolve));
  const origin = `http://127.0.0.1:${server.address().port}`;
  const health = await fetch(`${origin}/api/health`, { headers: { Origin: "http://localhost:5173" } });
  assert.equal(health.status, 200);
  assert.equal(health.headers.get("access-control-allow-origin"), "http://localhost:5173");
  assert.equal((await health.json()).success, true);

  const rejected = await fetch(`${origin}/api/health`, { headers: { Origin: "https://unexpected.invalid" } });
  assert.equal(rejected.status, 400);
  assert.deepEqual(await rejected.json(), { success: false, message: "Request could not be accepted." });
  assert.equal(rejected.headers.get("access-control-allow-origin"), null);
});

test("malformed JSON returns a safe JSON validation error", async (t) => {
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once("listening", resolve));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/auth/register`, {
    method: "POST", headers: { "Content-Type": "application/json" }, body: "{invalid-json",
  });
  assert.equal(response.status, 400);
  assert.deepEqual(await response.json(), { success: false, message: "Request body must contain valid JSON." });
});

test("readiness is unavailable until MongoDB is connected", async (t) => {
  const mongoose = require("mongoose");
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once("listening", resolve));
  const originalState = mongoose.connection.readyState;
  if (originalState !== 1) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/api/ready`);
    assert.equal(response.status, 503);
    assert.deepEqual(await response.json(), { success: false, message: "Service is not ready." });
  }
});

test("Super Admin dashboard endpoints require authenticated requests", async (t) => {
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once("listening", resolve));
  const response = await fetch(`http://127.0.0.1:${server.address().port}/api/admin/dashboard/stats`);
  assert.equal(response.status, 401);
});

test("legacy upload files are not exposed through a public static route", async (t) => {
  const server = app.listen(0);
  t.after(() => new Promise((resolve) => server.close(resolve)));
  await new Promise((resolve) => server.once("listening", resolve));

  const uploadDirectory = path.resolve(__dirname, "../uploads");
  const existingFiles = fs.existsSync(uploadDirectory)
    ? fs.readdirSync(uploadDirectory, { withFileTypes: true }).filter((entry) => entry.isFile()).map((entry) => entry.name)
    : [];
  const candidates = existingFiles.length ? existingFiles : ["unassociated-test-image.png"];

  for (const filename of candidates) {
    const response = await fetch(`http://127.0.0.1:${server.address().port}/uploads/${encodeURIComponent(filename)}`);
    assert.notEqual(response.status, 200, "Files in the legacy upload directory must not be anonymously served.");
  }
});
