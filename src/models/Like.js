const mongoose = require("mongoose");

// One record per (user, post) like — same pattern as tonight's
// Follow model, and matches how Facebook actually stores likes: a
// separate join record per reaction, not an array embedded on the
// post document itself. Keeps Post documents small regardless of how
// many likes a post accumulates, and the compound unique index below
// is what actually prevents a user from liking the same post twice
// (the pre-existing bug this model fixes — likePost previously just
// incremented a bare counter with no per-user tracking at all, so
// there was no way to know if a user had already liked a post, and
// no way to unlike).
const likeSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true },
  postId: { type: String, required: true, index: true },
  createdAt: { type: Date, default: Date.now },
});

likeSchema.index({ userId: 1, postId: 1 }, { unique: true });

module.exports = mongoose.model("Like", likeSchema);
