const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true, index: true },
  assignedArea: { type: String, required: true, trim: true, maxlength: 200 },
  isActive: { type: Boolean, default: true, index: true },
  assignedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  assignedAt: { type: Date, default: Date.now, required: true },
  revokedAt: { type: Date, default: null },
  lastRecoveryOperationAt: { type: Date, default: null, select: false },
}, { timestamps: true });
schema.index({ userId: 1, assignedArea: 1, isActive: 1 });
module.exports = mongoose.model("LocalAdminAssignment", schema);
