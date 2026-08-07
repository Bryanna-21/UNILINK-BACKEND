const mongoose = require("mongoose");

const studyGroupSchema = new mongoose.Schema({
  title: { type: String, required: true },
  courseId: String,
  description: String,
  meetingTime: String,
  location: String,
  ownerId: { type: String, required: true },
  memberIds: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("StudyGroup", studyGroupSchema);
