const mongoose = require("mongoose");

// NEVER populated for a Community with type: 'university-wide' — that
// membership is computed at query time (user.universityId ===
// community.universityId), not stored here. This model exists only
// for join/leave/moderate on every OTHER community type.
const communityMembershipSchema = new mongoose.Schema({
  communityId: { type: String, required: true },
  userId: { type: String, required: true },
  role: { type: String, enum: ["member", "moderator", "owner"], default: "member" },
  status: { type: String, enum: ["active", "pending", "banned"], default: "active" },
  // Used to compute unread counts against Post.createdAt for this
  // community's feed — see the Post-based feed design, no separate
  // per-post read-receipt system needed for a broadcast-style feed.
  lastViewedAt: { type: Date, default: Date.now },
  joinedAt: { type: Date, default: Date.now },
});

// One membership row per (communityId, userId) — joining twice should
// update the existing row, not create a duplicate.
communityMembershipSchema.index({ communityId: 1, userId: 1 }, { unique: true });

module.exports = mongoose.model("CommunityMembership", communityMembershipSchema);
