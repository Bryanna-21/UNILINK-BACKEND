const mongoose = require("mongoose");

const discussionSchema = new mongoose.Schema({
  courseId: { type: String, required: true },
  userId: { type: String, required: true },
  content: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Discussion", discussionSchema);
