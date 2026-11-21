const assert = require("node:assert/strict");
const test = require("node:test");
const mongoose = require("mongoose");
const Claim = require("../src/models/Claim");
const ItemReport = require("../src/models/ItemReport");
const Conversation = require("../src/models/Conversation");
const Message = require("../src/models/Message");
const AuditEvent = require("../src/models/AuditEvent");
const conversationController = require("../src/controllers/conversationController");
const claimController = require("../src/controllers/claimController");

function response() { return { statusCode: 200, body: null, status(code) { this.statusCode = code; return this; }, json(body) { this.body = body; return this; } }; }
function stub(t, object, key, implementation) { const old = object[key]; object[key] = implementation; t.after(() => { object[key] = old; }); }

test("verified claimant and finder can read their claim conversation", async (t) => {
  const claim = { _id: "claim-1", claimantId: "claimant", finderId: "finder", status: "verified" };
  const conversation = { _id: "conversation-1", claimId: "claim-1", claimantId: "claimant", finderId: "finder" };
  const savedMessage = { _id: "message-1", senderId: "claimant", body: "Hello", createdAt: new Date("2026-11-19T10:00:00Z") };
  stub(t, Claim, "findById", async () => claim);
  stub(t, Conversation, "findOne", async () => conversation);
  stub(t, Message, "find", (query) => {
    assert.equal(query.claimId, "claim-1");
    return { sort: () => ({ limit: async () => [savedMessage] }) };
  });
  for (const userId of ["claimant", "finder"]) {
    const res = response();
    await conversationController.getMessages({ params: { claimId: "claim-1" }, query: {}, user: { userId } }, res);
    assert.equal(res.statusCode, 200);
    assert.equal(res.body.data[0].body, "Hello");
    assert.equal(res.body.data[0].senderId, "claimant");
  }
});

test("unrelated users and claims without verified status cannot access messages", async (t) => {
  const current = { _id: "claim-2", claimantId: "claimant", finderId: "finder", status: "verified" };
  stub(t, Claim, "findById", async () => current);
  for (const [userId, status, expected] of [["stranger", "verified", 404], ["claimant", "rejected", 403], ["finder", "cancelled", 403], ["claimant", "suspended", 403]]) {
    current.status = status;
    const res = response();
    await conversationController.getMessages({ params: { claimId: "claim-2" }, query: {}, user: { userId } }, res);
    assert.equal(res.statusCode, expected);
  }
});

test("only verified participants can send and successful messages record sender and time", async (t) => {
  const claim = { _id: "claim-3", claimantId: "claimant", finderId: "finder", status: "verified" };
  const conversation = { _id: "conversation-3", claimId: "claim-3", claimantId: "claimant", finderId: "finder" };
  let created;
  stub(t, Claim, "findById", async () => claim);
  stub(t, Claim, "exists", async () => true);
  stub(t, Conversation, "findOne", async () => conversation);
  stub(t, Message, "create", async (doc) => { created = { ...doc, _id: "message-3", createdAt: new Date() }; return created; });
  stub(t, Conversation, "updateOne", async () => ({}));
  const res = response();
  await conversationController.sendMessage({ params: { claimId: "claim-3" }, body: { body: "  Let's coordinate here.  " }, user: { userId: "finder" } }, res);
  assert.equal(res.statusCode, 201);
  assert.equal(created.senderId, "finder");
  assert.equal(created.body, "Let's coordinate here.");
  assert.ok(created.createdAt instanceof Date);
  claim.status = "review_required";
  const denied = response();
  await conversationController.sendMessage({ params: { claimId: "claim-3" }, body: { body: "Should fail" }, user: { userId: "claimant" } }, denied);
  assert.equal(denied.statusCode, 403);
});

test("non-admin review action is denied and valid admin decisions are audited", async (t) => {
  const claim = { _id: "claim-4", status: "review_required" };
  let update;
  let audit;
  stub(t, mongoose, "startSession", async () => ({ withTransaction: async (callback) => callback(), endSession: async () => {} }));
  stub(t, Claim, "findById", async () => claim);
  stub(t, Claim, "findOneAndUpdate", async (_filter, change) => { update = change; return { _id: "claim-4", status: change.$set.status, verificationSource: change.$set.verificationSource }; });
  stub(t, AuditEvent, "create", async (entries) => { audit = Array.isArray(entries) ? entries[0] : entries; });
  const denied = response();
  await claimController.reviewClaim({ user: { userId: "user", role: "user" }, params: { claimId: "claim-4" }, body: { action: "approve", reason: "Reviewed details" } }, denied);
  assert.equal(denied.statusCode, 403);
  assert.equal(update, undefined);
  const allowed = response();
  await claimController.reviewClaim({ user: { userId: "admin-1", role: "admin" }, params: { claimId: "claim-4" }, body: { action: "approve", reason: "Reviewed ownership evidence" } }, allowed);
  assert.equal(allowed.statusCode, 200);
  assert.equal(update.$set.status, "verified");
  assert.equal(update.$push.reviewHistory.actorId, "admin-1");
  assert.equal(audit.actorId, "admin-1");
  assert.equal(audit.details.reason, "Reviewed ownership evidence");
});

test("review details are admin-only and omit verifier material", async (t) => {
  const claim = { _id: "claim-detail", status: "review_required", attempts: [{ number: 3, outcome: "review_required", createdAt: new Date() }], reviewHistory: [], questionSnapshot: [{ prompt: "Private prompt", verifier: { salt: "private-salt", hash: "private-hash" } }] };
  stub(t, Claim, "findById", async () => claim);
  stub(t, ItemReport, "findById", () => ({ select: async () => null }));
  const denied = response();
  await claimController.getReviewDetails({ user: { userId: "user", role: "user" }, params: { claimId: "claim-detail" } }, denied);
  assert.equal(denied.statusCode, 403);
  const allowed = response();
  await claimController.getReviewDetails({ user: { userId: "admin", role: "admin" }, params: { claimId: "claim-detail" } }, allowed);
  assert.equal(allowed.statusCode, 200);
  assert.equal(JSON.stringify(allowed.body).includes("private-salt"), false);
  assert.equal(JSON.stringify(allowed.body).includes("private-hash"), false);
});

test("review transitions require a reason and reject invalid states", async (t) => {
  const claim = { _id: "claim-5", status: "verified" };
  let audited = false;
  stub(t, Claim, "findById", async () => claim);
  stub(t, Claim, "findOneAndUpdate", async () => { throw new Error("must not update"); });
  stub(t, AuditEvent, "create", async () => { audited = true; });
  const noReason = response();
  await claimController.reviewClaim({ user: { userId: "admin", role: "admin" }, params: { claimId: "claim-5" }, body: { action: "reject", reason: " " } }, noReason);
  assert.equal(noReason.statusCode, 400);
  const invalid = response();
  await claimController.reviewClaim({ user: { userId: "admin", role: "admin" }, params: { claimId: "claim-5" }, body: { action: "reject", reason: "Reason provided" } }, invalid);
  assert.equal(invalid.statusCode, 409);
  assert.equal(audited, false);
});

test("a claimant can provide information requested by an admin, and the case returns to review", async (t) => {
  let captured;
  let audit;
  stub(t, Claim, "findOneAndUpdate", async (filter, update) => {
    assert.equal(filter.claimantId, "claimant");
    assert.equal(filter.status, "review_info_requested");
    captured = update.$push.reviewHistory;
    return { _id: "claim-6", status: update.$set.status };
  });
  stub(t, AuditEvent, "create", async (entry) => { audit = entry; });
  const res = response();
  await claimController.submitReviewInformation({ params: { claimId: "claim-6" }, user: { userId: "claimant" }, body: { information: "The item has a blue stitched lining." } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(captured.action, "submit_information");
  assert.equal(captured.actorId, "claimant");
  assert.equal(audit.action, "claim_information_submitted");
});

test("reported issues suspend communication and add a review audit event", async (t) => {
  let update;
  let audit;
  stub(t, Claim, "findOne", async (query) => { assert.deepEqual(query.$or, [{ claimantId: "finder" }, { finderId: "finder" }]); return { _id: "claim-7", status: "verified" }; });
  stub(t, Claim, "findOneAndUpdate", async (_filter, change) => { update = change; return { _id: "claim-7", status: change.$set.status }; });
  stub(t, AuditEvent, "create", async (entry) => { audit = entry; });
  const res = response();
  await conversationController.reportIssue({ params: { claimId: "claim-7" }, user: { userId: "finder" }, body: { reason: "We could not agree on the handover time." } }, res);
  assert.equal(res.statusCode, 200);
  assert.equal(update.$set.status, "issue_reported");
  assert.equal(update.$push.reviewHistory.actorId, "finder");
  assert.equal(audit.action, "claim_issue_reported");
});
