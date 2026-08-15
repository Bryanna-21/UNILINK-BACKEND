const mongoose = require("mongoose");

const assignmentSchema = new mongoose.Schema({
  courseId: { type: String, required: true },
  title: { type: String, required: true },
  instructions: String,
  dueDate: Date,
  maxScore: { type: Number, default: 100 },
  createdBy: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Assignment", assignmentSchema);
