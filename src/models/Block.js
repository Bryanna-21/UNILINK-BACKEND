const mongoose = require("mongoose");

// One document per block: { blockerId: A, blockedId: B } means A blocked B.
// Same plain-string-id convention as Follow. The unique index makes blocking
// idempotent, and the two single-field indexes serve "who did I block" and
// "who blocked me" without a collection scan.
const blockSchema = new mongoose.Schema({
  blockerId: { type: String, required: true, index: true },
  blockedId: { type: String, required: true, index: true },
  createdAt: { type: Date, default: Date.now },
});

blockSchema.index({ blockerId: 1, blockedId: 1 }, { unique: true });

module.exports = mongoose.model("Block", blockSchema);
