const mongoose = require("mongoose");

const postSchema = new mongoose.Schema({
  userId: String,
  universityId: String,
  content: String,
  mediaUrl: String,
  likes: { type: Number, default: 0 },
  commentsCount: { type: Number, default: 0 },
  score: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Post", postSchema);
