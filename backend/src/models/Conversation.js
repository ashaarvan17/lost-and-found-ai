const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  claimId: { type: mongoose.Schema.Types.ObjectId, ref: "Claim", required: true, unique: true },
  claimantId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  finderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  lastMessageAt: { type: Date, default: null },
}, { timestamps: true });
module.exports = mongoose.model("Conversation", schema);
