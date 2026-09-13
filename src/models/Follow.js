const mongoose = require("mongoose");

// One record per follow relationship — John follows James creates
// exactly one document: { followerId: John, followingId: James }.
// One-directional, instant, no approval step (confirmed: the real
// Instagram public-account model, not a request/accept system) —
// James automatically appears in John's "Following" list and John
// automatically appears in James's "Followers" list the moment this
// document is created. Unfollowing deletes it; there is no status
// field because there is no intermediate state to track.
const followSchema = new mongoose.Schema({
  followerId: { type: String, required: true, index: true }, // the person doing the following
  followingId: { type: String, required: true, index: true }, // the person being followed
  createdAt: { type: Date, default: Date.now },
});

// Prevents John from following James twice, and is also the natural
// index for the two queries this feature actually needs: "who does
// John follow" (query by followerId) and "who follows James" (query
// by followingId) — both already covered by the individual indexes
// above; this compound one exists specifically for uniqueness.
followSchema.index({ followerId: 1, followingId: 1 }, { unique: true });

module.exports = mongoose.model("Follow", followSchema);
