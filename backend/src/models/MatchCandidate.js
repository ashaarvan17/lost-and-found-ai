const mongoose = require("mongoose");
const schema = new mongoose.Schema({
  lostReportId: { type: mongoose.Schema.Types.ObjectId, ref: "ItemReport", required: true, select: false },
  foundReportId: { type: mongoose.Schema.Types.ObjectId, ref: "ItemReport", required: true, select: false },
}, { timestamps: true });
schema.index({ lostReportId: 1, foundReportId: 1 }, { unique: true });
module.exports = mongoose.model("MatchCandidate", schema);
