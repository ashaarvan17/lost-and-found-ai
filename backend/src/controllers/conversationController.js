const Claim = require("../models/Claim");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const AuditEvent = require("../models/AuditEvent");

async function getVerifiedParticipantClaim(req, res) {
  const claim = await Claim.findById(req.params.claimId);
  if (!claim || ![String(claim.claimantId), String(claim.finderId)].includes(String(req.user.userId))) {
    res.status(404).json({ success: false, message: "Conversation not found" });
    return null;
  }
  if (claim.status !== "verified") {
    res.status(403).json({ success: false, message: "Communication is unavailable for this claim" });
    return null;
  }
  return claim;
}

async function getOrCreateConversation(claim) {
  let conversation = await Conversation.findOne({ claimId: claim._id });
  if (conversation) {
    if (String(conversation.claimantId) !== String(claim.claimantId) || String(conversation.finderId) !== String(claim.finderId)) return null;
    return conversation;
  }
  try {
    return await Conversation.create({ claimId: claim._id, claimantId: claim.claimantId, finderId: claim.finderId });
  } catch (error) {
    if (error.code !== 11000) throw error;
    conversation = await Conversation.findOne({ claimId: claim._id });
    return conversation && String(conversation.claimantId) === String(claim.claimantId) && String(conversation.finderId) === String(claim.finderId) ? conversation : null;
  }
}

function messageDto(message) {
  return { id: String(message._id), senderId: String(message.senderId), body: message.body, createdAt: message.createdAt };
}

exports.getMessages = async (req, res) => {
  try {
    const claim = await getVerifiedParticipantClaim(req, res);
    if (!claim) return;
    const conversation = await getOrCreateConversation(claim);
    if (!conversation) return res.status(404).json({ success: false, message: "Conversation not found" });
    const before = req.query.before ? new Date(req.query.before) : null;
    if (before && Number.isNaN(before.getTime())) return res.status(400).json({ success: false, message: "Invalid history cursor" });
    const query = { claimId: claim._id, conversationId: conversation._id };
    if (before) query.createdAt = { $lt: before };
    const messages = await Message.find(query).sort({ createdAt: -1 }).limit(50);
    return res.status(200).json({ success: true, data: messages.reverse().map(messageDto) });
  } catch {
    return res.status(500).json({ success: false, message: "Failed to load conversation" });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    const claim = await getVerifiedParticipantClaim(req, res);
    if (!claim) return;
    if (typeof req.body.body !== "string" || !req.body.body.trim() || req.body.body.trim().length > 4000) {
      return res.status(400).json({ success: false, message: "Messages must contain 1 to 4000 characters." });
    }
    const conversation = await getOrCreateConversation(claim);
    if (!conversation) return res.status(404).json({ success: false, message: "Conversation not found" });
    // Recheck the current persisted state immediately before writing a message.
    const stillVerified = await Claim.exists({ _id: claim._id, status: "verified", $or: [{ claimantId: req.user.userId }, { finderId: req.user.userId }] });
    if (!stillVerified) return res.status(403).json({ success: false, message: "Communication is unavailable for this claim" });
    const message = await Message.create({ conversationId: conversation._id, claimId: claim._id, senderId: req.user.userId, body: req.body.body.trim() });
    await Conversation.updateOne({ _id: conversation._id, claimId: claim._id }, { $set: { lastMessageAt: message.createdAt } });
    return res.status(201).json({ success: true, data: messageDto(message) });
  } catch {
    return res.status(500).json({ success: false, message: "Failed to send message" });
  }
};

exports.reportIssue = async (req, res) => {
  try {
    const claim = await Claim.findOne({ _id: req.params.claimId, $or: [{ claimantId: req.user.userId }, { finderId: req.user.userId }] });
    if (!claim || ["cancelled", "rejected", "closed"].includes(claim.status)) return res.status(404).json({ success: false, message: "Claim not found" });
    const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
    if (reason.length < 5 || reason.length > 2000) return res.status(400).json({ success: false, message: "Describe the issue in 5 to 2000 characters." });
    const event = { actorId: req.user.userId, actorRole: "user", action: "report_issue", reason, createdAt: new Date() };
    const updated = await Claim.findOneAndUpdate({ _id: claim._id, status: claim.status }, { $set: { status: "issue_reported" }, $push: { reviewHistory: event } }, { new: true });
    if (!updated) return res.status(409).json({ success: false, message: "Claim changed; reload and try again." });
    await AuditEvent.create({ actorId: req.user.userId, action: "claim_issue_reported", resourceType: "Claim", resourceId: claim._id, details: { reason } });
    return res.status(200).json({ success: true, data: { status: updated.status } });
  } catch {
    return res.status(500).json({ success: false, message: "Failed to report issue" });
  }
};
