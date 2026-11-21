const mongoose = require("mongoose");
const verifierSchema = new mongoose.Schema({ salt: { type: String, required: true }, hash: { type: String, required: true } }, { _id: false });
const eventSchema = new mongoose.Schema({
  type: { type: String, enum: ["otp_generated", "otp_invalid", "otp_expired", "otp_locked", "otp_replayed", "completed"], required: true },
  actorId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  occurredAt: { type: Date, default: Date.now },
  attempt: Number,
}, { _id: false });
const schema = new mongoose.Schema({
  claimId: { type: mongoose.Schema.Types.ObjectId, ref: "Claim", default: null, index: true },
  itemId: { type: mongoose.Schema.Types.ObjectId, ref: "ItemReport", required: true, index: true },
  purpose: { type: String, enum: ["personal_handover", "local_admin_deposit", "local_admin_collection"], required: true, index: true },
  activeKey: { type: String, select: false },
  status: { type: String, enum: ["pending", "otp_issued", "completed", "cancelled"], default: "pending", index: true },
  claimantId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  finderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  localAdminAssignmentId: { type: mongoose.Schema.Types.ObjectId, ref: "LocalAdminAssignment", default: null },
  localAdminId: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  area: { type: String, required: true, trim: true },
  otpVerifier: { type: verifierSchema, select: false },
  otpGeneration: { type: Number, default: 0 },
  otpGenerationCount: { type: Number, default: 0 },
  otpAttemptCount: { type: Number, default: 0 },
  otpIssuedAt: Date,
  otpExpiresAt: Date,
  otpConsumedAt: Date,
  otpLockedUntil: Date,
  completedAt: Date,
  completedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", default: null },
  events: { type: [eventSchema], default: [] },
}, { timestamps: true });
schema.index({ itemId: 1, purpose: 1, status: 1 });
schema.index({ claimId: 1, purpose: 1, status: 1 });
schema.index({ activeKey: 1 }, { unique: true, sparse: true });
module.exports = mongoose.model("RecoveryTransaction", schema);
