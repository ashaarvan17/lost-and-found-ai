const assert = require("node:assert/strict");
const path = require("node:path");
const test = require("node:test");

require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const ItemReport = require("../src/models/ItemReport");
const axios = require("axios");
const controller = require("../src/controllers/itemReportController");
const MatchCandidate = require("../src/models/MatchCandidate");
const Claim = require("../src/models/Claim");
const RecoveryTransaction = require("../src/models/RecoveryTransaction");
const imagekit = require("../src/config/imagekit");

function responseRecorder() {
  return {
    statusCode: 200,
    body: undefined,
    status(code) {
      this.statusCode = code;
      return this;
    },
    set(name, value) {
      this.headers ||= {};
      this.headers[name.toLowerCase()] = value;
      return this;
    },
    json(body) {
      this.body = body;
      return this;
    },
  };
}

function leanQuery(rows) {
  return { select() { return this; }, lean: async () => rows };
}

const privateFoundReport = {
  _id: "found-1",
  title: "Blue backpack",
  description: "Private description with hidden details",
  type: "found",
  category: "Bags",
  location: "Library",
  date: new Date("2026-11-01"),
  imageUrl: "https://ik.imagekit.io/findback/findback-ai/items/private-image.png",
  imageFileId: "private-file-id",
  estimatedReplacementValueInr: 2000,
  valueTier: "low",
  ownershipQuestions: [{ prompt: "What is the hidden mark?", verifier: { salt: "private-salt", hash: "private-hash" } }],
  status: "active",
  userId: "owner-1",
};

test("public browse includes resolved lost reports and excludes closed/found reports", async (t) => {
  const originalFind = ItemReport.find;
  const originalClaimFind = Claim.find;
  const originalRecoveryFind = RecoveryTransaction.find;
  t.after(() => { ItemReport.find = originalFind; Claim.find = originalClaimFind; RecoveryTransaction.find = originalRecoveryFind; });

  const records = [
    { ...privateFoundReport, _id: "active-lost", type: "lost", status: "active" },
    { ...privateFoundReport, _id: "legacy-recovered-lost", type: "lost", status: "active" },
    { ...privateFoundReport, _id: "resolved-lost", type: "lost", status: "resolved" },
    { ...privateFoundReport, _id: "closed-lost", type: "lost", status: "closed" },
    { ...privateFoundReport, _id: "resolved-found", type: "found", status: "resolved" },
  ];
  ItemReport.find = (query) => {
    if (query.type === "lost") {
      assert.deepEqual(query, { type: "lost", status: { $in: ["active", "resolved"] } });
      return { sort: async () => records.filter((report) => report.type === query.type && query.status.$in.includes(report.status)) };
    }
    assert.deepEqual(query, { _id: { $in: ["resolved-found"] }, type: "found", status: "resolved", custodyStatus: "with_owner" });
    return leanQuery([{ _id: "resolved-found" }]);
  };
  Claim.find = (query) => {
    assert.equal(query.status, "verified");
    return leanQuery([{ _id: "claim-1", lostReportId: "legacy-recovered-lost", foundReportId: "resolved-found" }]);
  };
  RecoveryTransaction.find = (query) => {
    assert.equal(query.status, "completed");
    return leanQuery([{ claimId: "claim-1" }]);
  };

  const res = responseRecorder();
  await controller.getAllReports({}, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.length, 3);
  assert.deepEqual(res.body.data.map(({ _id, status }) => [_id, status]), [
    ["active-lost", "active"],
    ["legacy-recovered-lost", "resolved"],
    ["resolved-lost", "resolved"],
  ]);
  assert.ok(res.body.data.every((report) => report.type === "lost"));
  assert.equal("userId" in res.body.data[0], false);
  assert.equal("imageFileId" in res.body.data[0], false);
});

test("resolved reports remain in reporter history and legacy recovered lost reports display resolved", async (t) => {
  const originalFind = ItemReport.find;
  const originalClaimFind = Claim.find;
  const originalRecoveryFind = RecoveryTransaction.find;
  t.after(() => { ItemReport.find = originalFind; Claim.find = originalClaimFind; RecoveryTransaction.find = originalRecoveryFind; });
  const resolvedFound = { ...privateFoundReport, status: "resolved", imageUrl: "" };
  const activeLost = { ...privateFoundReport, _id: "legacy-recovered-lost", type: "lost", status: "active", imageUrl: "" };
  const activeFound = { ...privateFoundReport, _id: "active-found", status: "active", imageUrl: "" };
  ItemReport.find = (query) => {
    if (query.userId) {
      assert.deepEqual(query, { userId: "owner-1" });
      return { select() { return this; }, sort: async () => [resolvedFound, activeLost, activeFound] };
    }
    assert.deepEqual(query, { _id: { $in: ["found-1"] }, type: "found", status: "resolved", custodyStatus: "with_owner" });
    return leanQuery([{ _id: "found-1" }]);
  };
  Claim.find = (query) => {
    assert.equal(query.status, "verified");
    return leanQuery([{ _id: "claim-1", lostReportId: "legacy-recovered-lost", foundReportId: "found-1" }]);
  };
  RecoveryTransaction.find = () => leanQuery([{ claimId: "claim-1" }]);

  const res = responseRecorder();
  await controller.getMyReports({ user: { userId: "owner-1" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.headers["cache-control"], "private, no-store");
  assert.equal(res.body.data.length, 3);
  assert.deepEqual(res.body.data.map(({ type, status }) => [type, status]), [
    ["found", "resolved"],
    ["lost", "resolved"],
    ["found", "active"],
  ]);
  assert.deepEqual(res.body.data[0].ownershipQuestions, [{ prompt: "What is the hidden mark?" }]);
  assert.equal(JSON.stringify(res.body).includes("private-hash"), false);
});

test("found report details are denied to anonymous and other users", async (t) => {
  const originalFindById = ItemReport.findById;
  t.after(() => { ItemReport.findById = originalFindById; });
  ItemReport.findById = () => ({ select: async () => privateFoundReport });

  for (const user of [undefined, { userId: "other-user" }]) {
    const res = responseRecorder();
    await controller.getReportById({ params: { id: "found-1" }, user }, res);
    assert.equal(res.statusCode, 404);
    assert.deepEqual(res.body, { success: false, message: "Item report not found" });
  }
});

test("found report owner can read an allowlisted private DTO", async (t) => {
  const originalFindById = ItemReport.findById;
  const originalImagekitUrl = imagekit.url;
  const originalEndpoint = process.env.IMAGEKIT_URL_ENDPOINT;
  process.env.IMAGEKIT_URL_ENDPOINT = "https://ik.imagekit.io/findback";
  imagekit.url = ({ src, signed, expireSeconds }) => `${src}?signed=${signed}&expires=${expireSeconds}`;
  t.after(() => { ItemReport.findById = originalFindById; imagekit.url = originalImagekitUrl; process.env.IMAGEKIT_URL_ENDPOINT = originalEndpoint; });
  ItemReport.findById = () => ({ select: async () => privateFoundReport });

  const res = responseRecorder();
  await controller.getReportById(
    { params: { id: "found-1" }, user: { userId: "owner-1" } },
    res,
  );

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.description, privateFoundReport.description);
  assert.equal("userId" in res.body.data, false);
  assert.equal("imageFileId" in res.body.data, false);
  assert.deepEqual(res.body.data.ownershipQuestions, [{ prompt: "What is the hidden mark?" }]);
  assert.equal(JSON.stringify(res.body).includes("private-salt"), false);
  assert.equal(JSON.stringify(res.body).includes("private-hash"), false);
  assert.match(res.body.data.imageUrl, /signed=true&expires=300/);
});

test("private image endpoint is finder-only and emits a short-lived signed URL", async (t) => {
  const originalFindOne = ItemReport.findOne;
  const originalImagekitUrl = imagekit.url;
  const originalEndpoint = process.env.IMAGEKIT_URL_ENDPOINT;
  process.env.IMAGEKIT_URL_ENDPOINT = "https://ik.imagekit.io/findback";
  let signOptions;
  imagekit.url = (options) => { signOptions = options; return `${options.src}?signed=true`; };
  ItemReport.findOne = (query) => ({ select: async () => query.userId === "owner-1" ? privateFoundReport : null });
  t.after(() => {
    ItemReport.findOne = originalFindOne;
    imagekit.url = originalImagekitUrl;
    if (originalEndpoint === undefined) delete process.env.IMAGEKIT_URL_ENDPOINT;
    else process.env.IMAGEKIT_URL_ENDPOINT = originalEndpoint;
  });

  const ownerResponse = responseRecorder();
  await controller.getPrivateReportImage({ params: { id: "found-1" }, user: { userId: "owner-1" } }, ownerResponse);
  assert.equal(ownerResponse.statusCode, 200);
  assert.equal(ownerResponse.headers["cache-control"], "private, no-store");
  assert.equal(signOptions.signed, true);
  assert.equal(signOptions.expireSeconds, 300);
  assert.equal(ownerResponse.body.data.imageUrl.includes("private-image"), true);

  const strangerResponse = responseRecorder();
  await controller.getPrivateReportImage({ params: { id: "found-1" }, user: { userId: "stranger" } }, strangerResponse);
  assert.equal(strangerResponse.statusCode, 404);
  assert.equal(strangerResponse.body.data, undefined);
});

test("match indications never contain found report details", async (t) => {
  const originalFind = ItemReport.find;
  const originalPost = axios.post;
  const originalFindOneAndUpdate = MatchCandidate.findOneAndUpdate;
  const originalClaimFind = Claim.find;
  const originalRecoveryFind = RecoveryTransaction.find;
  t.after(() => {
    ItemReport.find = originalFind;
    axios.post = originalPost;
    MatchCandidate.findOneAndUpdate = originalFindOneAndUpdate;
    Claim.find = originalClaimFind;
    RecoveryTransaction.find = originalRecoveryFind;
  });

  const lost = {
    _id: "lost-1",
    title: "Black phone",
    description: "Black phone with a case",
    type: "lost",
    category: "Electronics",
    location: "Library",
    date: new Date("2026-11-01"),
  };
  const found = {
    _id: "secret-found-id",
    title: "Private found phone",
    description: "Secret finder-only details",
    type: "found",
    category: "Electronics",
    location: "Library",
    date: new Date("2026-11-01"),
    imageUrl: "https://example.invalid/found-photo",
    userId: "finder-1",
  };

  ItemReport.find = (query) => {
    assert.equal(query.status, "active");
    if (query.type === "lost") {
      assert.equal(query.userId, "owner-1");
      return [lost];
    }
    assert.equal(query.type, "found");
    assert.deepEqual(query.userId, { $ne: "owner-1" });
    return [found];
  };
  Claim.find = () => leanQuery([]);
  axios.post = async () => ({ data: { success: true, textSimilarity: 80 } });
  MatchCandidate.findOneAndUpdate = () => ({ select: async () => ({ _id: "opaque-candidate-id" }) });

  const res = responseRecorder();
  await controller.getMyMatches({ user: { userId: "owner-1" } }, res);

  assert.equal(res.statusCode, 200);
  assert.equal(res.body.data.length, 1);
  assert.deepEqual(Object.keys(res.body.data[0]).sort(), ["id", "lostReport", "status"]);
  assert.equal(res.body.data[0].lostReport.title, lost.title);
  assert.equal(res.body.data[0].id, "opaque-candidate-id");
  assert.equal(JSON.stringify(res.body).includes(found._id), false);
  assert.equal(JSON.stringify(res.body).includes(found.description), false);
  assert.equal(JSON.stringify(res.body).includes(found.imageUrl), false);
});
