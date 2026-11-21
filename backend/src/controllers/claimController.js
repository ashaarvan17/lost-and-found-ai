const mongoose = require("mongoose");
const Claim = require("../models/Claim");
const MatchCandidate = require("../models/MatchCandidate");
const ItemReport = require("../models/ItemReport");
const AuditEvent = require("../models/AuditEvent");
const { getOwnershipVerificationSettings } = require("../config/ownershipVerification");
const { evaluateVerificationAttempt } = require("../services/ownershipVerification");

class ReviewError extends Error { constructor(status, message) { super(message); this.status = status; } }
async function withTransaction(work) {
  const session = await mongoose.startSession();
  try { let result; await session.withTransaction(async () => { result = await work(session); }); return result; }
  finally { await session.endSession(); }
}

function claimDto(claim, includeQuestions = true) {
  return {
    id: String(claim._id), status: claim.status, valueTier: claim.valueTier,
    attemptCount: claim.attemptCount, attemptsRemaining: Math.max(0, claim.maxAttempts - claim.attemptCount),
    lockedUntil: claim.lockedUntil || null, contactEnabled: claim.status === "verified",
    ...(includeQuestions ? { questions: (claim.questionSnapshot || []).map(({ prompt }) => ({ prompt })) } : {}),
  };
}

exports.beginClaim = async (req, res) => {
  try {
    const candidate = await MatchCandidate.findById(req.params.candidateId).select("+lostReportId +foundReportId");
    if (!candidate) return res.status(404).json({ success: false, message: "Possible match not found" });
    const [lost, found] = await Promise.all([
      ItemReport.findOne({ _id: candidate.lostReportId, userId: req.user.userId, type: "lost", status: "active" }),
      ItemReport.findOne({ _id: candidate.foundReportId, type: "found", status: "active" }).select("+ownershipQuestions"),
    ]);
    if (!lost || !found || String(lost.userId) === String(found.userId) || !found.valueTier || !Array.isArray(found.ownershipQuestions)) {
      return res.status(404).json({ success: false, message: "Possible match not found" });
    }
    const settings = getOwnershipVerificationSettings();
    const expectedCount = settings.questionCounts[found.valueTier];
    if (!expectedCount || found.ownershipQuestions.length !== expectedCount) return res.status(409).json({ success: false, message: "This report needs ownership verification review." });
    let claim = await Claim.findOne({ candidateId: candidate._id, claimantId: req.user.userId }).select("+questionSnapshot +maxAttempts");
    if (!claim) {
      try {
        claim = await Claim.create({
          candidateId: candidate._id, lostReportId: lost._id, foundReportId: found._id,
          claimantId: req.user.userId, finderId: found.userId, valueTier: found.valueTier,
          questionSnapshot: found.ownershipQuestions.map(({ prompt, verifier }) => ({ prompt, verifier: { salt: verifier.salt, hash: verifier.hash } })),
          requiredCorrect: settings.requiredCorrect[found.valueTier], maxAttempts: settings.maxAttempts,
          lockoutHours: settings.lockoutHours,
        });
        claim.maxAttempts = settings.maxAttempts;
      } catch (error) {
        if (error.code !== 11000) throw error;
        claim = await Claim.findOne({ candidateId: candidate._id, claimantId: req.user.userId }).select("+questionSnapshot +maxAttempts");
      }
    }
    return res.status(200).json({ success: true, data: claimDto(claim) });
  } catch {
    return res.status(500).json({ success: false, message: "Failed to start ownership verification" });
  }
};

exports.getMyClaims = async (req, res) => {
  try {
    const claims = await Claim.find({ $or: [{ claimantId: req.user.userId }, { finderId: req.user.userId }] }).select("+questionSnapshot +maxAttempts").sort({ createdAt: -1 });
    return res.status(200).json({ success: true, data: claims.map((claim) => {
      const isClaimant = String(claim.claimantId) === String(req.user.userId);
      const latestRequest = isClaimant && claim.status === "review_info_requested"
        ? [...(claim.reviewHistory || [])].reverse().find((event) => event.action === "request_information")
        : null;
      return { ...claimDto(claim, isClaimant), viewerId: String(req.user.userId), participantRole: isClaimant ? "claimant" : "finder", ...(latestRequest ? { requestInformation: latestRequest.reason } : {}) };
    }) });
  } catch {
    return res.status(500).json({ success: false, message: "Failed to fetch claims" });
  }
};

exports.submitAnswers = async (req, res) => {
  try {
    const claim = await Claim.findOne({ _id: req.params.claimId, claimantId: req.user.userId })
      .select("+questionSnapshot +requiredCorrect +maxAttempts +lockoutHours");
    if (!claim) return res.status(404).json({ success: false, message: "Claim not found" });
    const now = new Date();
    if (claim.status === "verified" || claim.status === "review_required" || claim.status === "cancelled") {
      return res.status(409).json({ success: false, message: "This claim cannot accept another attempt." });
    }
    if (claim.lockedUntil && claim.lockedUntil > now) return res.status(423).json({ success: false, message: "Verification is temporarily locked. Please try again later." });
    if (!Array.isArray(req.body.answers) || req.body.answers.some((answer) => typeof answer !== "string")) {
      return res.status(400).json({ success: false, message: "Submit one answer for each question." });
    }
    const snapshotSettings = {
      questionCounts: { [claim.valueTier]: claim.questionSnapshot.length },
      requiredCorrect: { [claim.valueTier]: claim.requiredCorrect },
      maxAttempts: claim.maxAttempts,
      lockoutHours: claim.lockoutHours,
    };
    const result = await evaluateVerificationAttempt({ valueTier: claim.valueTier, expectedAnswerVerifiers: claim.questionSnapshot.map((q) => q.verifier), submittedAnswers: req.body.answers, failedAttempts: claim.attemptCount, now, settings: snapshotSettings });
    if (!result.allowed) return res.status(423).json({ success: false, message: "Verification requires Main Admin review." });
    const nextCount = claim.attemptCount + 1;
    const filter = { _id: claim._id, claimantId: req.user.userId, attemptCount: claim.attemptCount, status: { $in: ["questions_issued", "verification_failed"] } };
    const update = {
      $set: { status: result.status, ...(result.lockedUntil ? { lockedUntil: result.lockedUntil } : {}), ...(result.passed ? { verifiedAt: now } : {}) },
      $inc: { attemptCount: 1 },
      $push: { attempts: { number: nextCount, outcome: result.passed ? "verified" : result.status === "review_required" ? "review_required" : "failed", createdAt: now } },
    };
    const updated = await Claim.findOneAndUpdate(filter, update, { new: true }).select("+maxAttempts");
    if (!updated) return res.status(409).json({ success: false, message: "Claim changed; reload before submitting again." });
    return res.status(200).json({ success: true, data: { status: updated.status, verified: updated.status === "verified", contactEnabled: updated.status === "verified", attemptsRemaining: Math.max(0, claim.maxAttempts - updated.attemptCount), lockedUntil: updated.lockedUntil || null } });
  } catch (error) {
    const invalid = error instanceof TypeError;
    return res.status(invalid ? 400 : 500).json({ success: false, message: invalid ? error.message : "Failed to verify ownership" });
  }
};

exports.getReviewQueue = async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ success: false, message: "Main Admin access required" });
  try {
    const reviewStates = ["review_required", "issue_reported", "review_info_requested", "escalated"];
    const claims = await Claim.find({ status: { $in: reviewStates } }).select("status valueTier attemptCount createdAt lostReportId foundReportId claimantId finderId").sort({ updatedAt: 1 });
    await AuditEvent.create({ actorId: req.user.userId, action: "claim_review_queue_viewed", resourceType: "ClaimQueue", resourceId: claims[0]?._id || req.user.userId, details: { resultCount: claims.length } });
    return res.status(200).json({ success: true, data: claims.map((claim) => ({ id: String(claim._id), status: claim.status, valueTier: claim.valueTier, attemptCount: claim.attemptCount, createdAt: claim.createdAt })) });
  } catch {
    return res.status(500).json({ success: false, message: "Failed to fetch review queue" });
  }
};

exports.getReviewDetails = async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ success: false, message: "Main Admin access required" });
  try {
    const claim = await Claim.findById(req.params.claimId);
    if (!claim) return res.status(404).json({ success: false, message: "Claim not found" });
    const [lost, found] = await Promise.all([
      ItemReport.findById(claim.lostReportId).select("title category location date"),
      ItemReport.findById(claim.foundReportId).select("title category location date"),
    ]);
    return res.status(200).json({ success: true, data: {
      id: String(claim._id), status: claim.status, valueTier: claim.valueTier, attemptCount: claim.attemptCount,
      lostItem: lost && { title: lost.title, category: lost.category, location: lost.location, date: lost.date },
      foundItem: found && { title: found.title, category: found.category, location: found.location, date: found.date },
      attempts: (claim.attempts || []).map(({ number, outcome, createdAt }) => ({ number, outcome, createdAt })),
      reviewHistory: (claim.reviewHistory || []).map(({ actorId, actorRole, action, reason, createdAt }) => ({ actorId: String(actorId), actorRole, action, reason, createdAt })),
    } });
  } catch {
    return res.status(500).json({ success: false, message: "Failed to fetch claim review details" });
  }
};

exports.reviewClaim = async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ success: false, message: "Main Admin access required" });
  const transitions = {
    request_information: { from: ["review_required", "issue_reported", "review_info_requested", "escalated"], to: "review_info_requested" },
    approve: { from: ["review_required", "issue_reported", "review_info_requested", "escalated"], to: "verified" },
    reject: { from: ["review_required", "issue_reported", "review_info_requested", "escalated"], to: "rejected" },
    escalate: { from: ["review_required", "issue_reported", "review_info_requested"], to: "escalated" },
    close: { from: ["review_required", "issue_reported", "review_info_requested", "escalated", "rejected"], to: "closed" },
  };
  const action = req.body.action;
  const reason = typeof req.body.reason === "string" ? req.body.reason.trim() : "";
  const transition = transitions[action];
  if (!transition) return res.status(400).json({ success: false, message: "Unsupported review action" });
  if (reason.length < 5 || reason.length > 2000) return res.status(400).json({ success: false, message: "A reason between 5 and 2000 characters is required." });
  try {
    const current = await Claim.findById(req.params.claimId);
    if (!current) return res.status(404).json({ success: false, message: "Claim not found" });
    if (!transition.from.includes(current.status)) return res.status(409).json({ success: false, message: `Action is not allowed for claim state '${current.status}'.` });
    const now = new Date();
    const event = { actorId: req.user.userId, actorRole: "admin", action, reason, createdAt: now };
    const fields = { status: transition.to };
    if (action === "approve") { fields.verificationSource = "admin_review"; fields.verifiedAt = now; }
    const updated = await withTransaction(async (session) => {
      const result = await Claim.findOneAndUpdate({ _id: current._id, status: current.status }, { $set: fields, $push: { reviewHistory: event } }, { new: true, session });
      if (!result) throw new ReviewError(409, "Claim changed; reload before reviewing it.");
      await AuditEvent.create([{ actorId: req.user.userId, action: `claim_${action}`, resourceType: "Claim", resourceId: current._id, details: { previousStatus: current.status, newStatus: transition.to, reason } }], { session });
      return result;
    });
    return res.status(200).json({ success: true, data: { id: String(updated._id), status: updated.status, verificationSource: updated.verificationSource } });
  } catch (error) {
    if (error instanceof ReviewError) return res.status(error.status).json({ success: false, message: error.message });
    return res.status(500).json({ success: false, message: "Failed to apply review action" });
  }
};

exports.submitReviewInformation = async (req, res) => {
  const information = typeof req.body.information === "string" ? req.body.information.trim() : "";
  if (information.length < 5 || information.length > 2000) return res.status(400).json({ success: false, message: "Additional information must be 5 to 2000 characters." });
  try {
    const now = new Date();
    const event = { actorId: req.user.userId, actorRole: "user", action: "submit_information", reason: information, createdAt: now };
    const updated = await Claim.findOneAndUpdate({ _id: req.params.claimId, claimantId: req.user.userId, status: "review_info_requested" }, { $set: { status: "review_required" }, $push: { reviewHistory: event } }, { new: true });
    if (!updated) return res.status(404).json({ success: false, message: "No information request is awaiting a response." });
    await AuditEvent.create({ actorId: req.user.userId, action: "claim_information_submitted", resourceType: "Claim", resourceId: updated._id, details: { characterCount: information.length } });
    return res.status(200).json({ success: true, data: { status: updated.status } });
  } catch {
    return res.status(500).json({ success: false, message: "Failed to submit additional information" });
  }
};
