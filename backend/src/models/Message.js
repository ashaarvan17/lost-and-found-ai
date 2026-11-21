const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  conversationId: { type: mongoose.Schema.Types.ObjectId, ref: "Conversation", required: true, index: true },
  claimId: { type: mongoose.Schema.Types.ObjectId, ref: "Claim", required: true, index: true },
  senderId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
  body: { type: String, required: true, trim: true, maxlength: 4000 },
}, { timestamps: true });
schema.index({ claimId: 1, createdAt: -1 });
module.exports = mongoose.model("Message", schema);
