const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  key: { type: String, required: true },
  bucketStart: { type: Date, required: true },
  count: { type: Number, required: true, default: 0 },
  expiresAt: { type: Date, required: true },
}, { versionKey: false });

schema.index({ key: 1, bucketStart: 1 }, { unique: true });
schema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });

module.exports = mongoose.model("RateLimitBucket", schema);
