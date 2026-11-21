const mongoose = require("mongoose");
const verifierSchema = new mongoose.Schema({ salt: { type: String, required: true }, hash: { type: String, required: true } }, { _id: false });
const questionSchema = new mongoose.Schema({ prompt: { type: String, required: true }, verifier: { type: verifierSchema, required: true } }, { _id: false });
const attemptSchema = new mongoose.Schema({ number: Number, outcome: { type: String, enum: ["failed", "verified", "review_required"] }, createdAt: { type: Date, default: Date.now } }, { _id: false });
const reviewEventSchema = new mongoose.Schema({
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  actorRole: { type: String, enum: ["admin", "user"], required: true },
  action: { type: String, enum: ["request_information", "submit_information", "approve", "reject", "escalate", "close", "report_issue"], required: true },
  reason: { type: String, required: true, maxlength: 2000 },
  createdAt: { type: Date, default: Date.now },
}, { _id: false, timestamps: false });
const schema = new mongoose.Schema({
  candidateId: { type: mongoose.Schema.Types.ObjectId, ref: "MatchCandidate", required: true },
  lostReportId: { type: mongoose.Schema.Types.ObjectId, ref: "ItemReport", required: true },
  foundReportId: { type: mongoose.Schema.Types.ObjectId, ref: "ItemReport", required: true },
  claimantId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  finderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  valueTier: { type: String, enum: ["low", "intermediate", "high"], required: true },
  questionSnapshot: { type: [questionSchema], required: true, select: false },
  requiredCorrect: { type: Number, required: true, select: false },
  maxAttempts: { type: Number, required: true, select: false },
  lockoutHours: { type: Number, required: true, select: false },
  attemptCount: { type: Number, default: 0 },
  attempts: { type: [attemptSchema], default: [] },
  status: { type: String, enum: ["questions_issued", "verification_failed", "verified", "review_required", "review_info_requested", "issue_reported", "escalated", "rejected", "closed", "suspended", "cancelled"], default: "questions_issued" },
  verificationSource: { type: String, enum: ["questionnaire", "admin_review"], default: "questionnaire" },
  reviewHistory: { type: [reviewEventSchema], default: [] },
  lockedUntil: Date,
  verifiedAt: Date,
  recoveryAuthorizationCheckedAt: { type: Date, default: null, select: false },
}, { timestamps: true });
schema.index({ candidateId: 1, claimantId: 1 }, { unique: true });
module.exports = mongoose.model("Claim", schema);
