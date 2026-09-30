const mongoose = require("mongoose");

const clubSchema = new mongoose.Schema({
  name: { type: String, required: true },
  description: String,
  ownerId: { type: String, required: true },
  // Added retroactively — clubs previously had NO university scoping,
  // meaning every club was visible to every user regardless of
  // institution. Required going forward; existing documents need a
  // one-time backfill (see scripts/backfillUniversityScoping.js)
  // before this field can be trusted as always-present.
  universityId: { type: String, required: true },
  memberIds: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Club", clubSchema);
