const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

require("dotenv").config({ path: path.join(__dirname, "..", ".env.development"), quiet: true });
const ItemReport = require("../src/models/ItemReport");
const imagekit = require("../src/config/imagekit");
const controller = require("../src/controllers/itemReportController");
const { getQuestionCount } = require("../src/config/itemValueTier");

function responseRecorder() {
  return {
    statusCode: 200,
    status(code) { this.statusCode = code; return this; },
    json(body) { this.body = body; return this; },
  };
}

function developmentForm() {
  return {
    title: "Found bag",
    description: "A bag found on campus",
    type: "found",
    category: "Bags",
    location: "Library",
    date: "2026-11-20",
    estimatedReplacementValueInr: "100",
    ownershipQuestions: JSON.stringify(Array.from({ length: getQuestionCount("low") }, (_, index) => ({
      prompt: `Question ${index + 1}`,
      expectedAnswer: `Answer ${index + 1}`,
    }))),
  };
}

function pngFile() {
  return {
    buffer: Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
    mimetype: "image/png",
    originalname: "item.png",
  };
}

test("image upload fails closed when secure validation token is missing", async (t) => {
  const oldToken = process.env.AI_SERVICE_TOKEN;
  const originalUpload = imagekit.upload;
  const originalCreate = ItemReport.create;
  const originalFetch = global.fetch;
  delete process.env.AI_SERVICE_TOKEN;
  let uploaded = false;
  imagekit.upload = async () => { uploaded = true; };
  ItemReport.create = async () => { throw new Error("Database must not be reached"); };
  global.fetch = async () => { throw new Error("Validation must not be reached"); };
  t.after(() => {
    if (oldToken === undefined) delete process.env.AI_SERVICE_TOKEN;
    else process.env.AI_SERVICE_TOKEN = oldToken;
    imagekit.upload = originalUpload;
    ItemReport.create = originalCreate;
    global.fetch = originalFetch;
  });

  const res = responseRecorder();
  await controller.createReport({ body: developmentForm(), file: pngFile(), user: { userId: "dev-user" } }, res);

  assert.equal(res.statusCode, 503);
  assert.equal(res.body.message, "Secure image validation is not configured.");
  assert.equal(uploaded, false);
});

test("validated found image uploads remain private and use the dev folder", async (t) => {
  const names = ["AI_SERVICE_TOKEN", "IMAGEKIT_UPLOAD_FOLDER"];
  const oldValues = Object.fromEntries(names.map((name) => [name, process.env[name]]));
  const originalUpload = imagekit.upload;
  const originalCreate = ItemReport.create;
  const originalFetch = global.fetch;
  process.env.AI_SERVICE_TOKEN = "test-validation-token";
  process.env.IMAGEKIT_UPLOAD_FOLDER = "/findback-ai/development/items";
  let validationToken;
  let uploadOptions;
  global.fetch = async (_url, options) => {
    validationToken = options.headers["X-AI-Service-Token"];
    return { ok: true, status: 200, json: async () => ({ success: true, image: { width: 1, height: 1, pixelCount: 1 } }) };
  };
  imagekit.upload = async (options) => {
    uploadOptions = options;
    return { url: "https://ik.imagekit.io/private/item.png", fileId: "private-file" };
  };
  ItemReport.create = async (data) => ({ _id: "report-1", ...data, status: "active" });
  t.after(() => {
    for (const name of names) {
      if (oldValues[name] === undefined) delete process.env[name];
      else process.env[name] = oldValues[name];
    }
    imagekit.upload = originalUpload;
    ItemReport.create = originalCreate;
    global.fetch = originalFetch;
  });

  const res = responseRecorder();
  await controller.createReport({ body: developmentForm(), file: pngFile(), user: { userId: "dev-user" } }, res);

  assert.equal(res.statusCode, 201);
  assert.equal(validationToken, "test-validation-token");
  assert.equal(uploadOptions.isPrivateFile, true);
  assert.equal(uploadOptions.folder, "/findback-ai/development/items");
  assert.equal(res.body.data.imageUrl, undefined);
  assert.equal(JSON.stringify(res.body).includes("private-file"), false);
});
