const mongoose = require("mongoose");

const submissionSchema = new mongoose.Schema({
  assignmentId: { type: String, required: true },
  studentId: { type: String, required: true },
  textAnswer: String,
  submittedAt: { type: Date, default: Date.now },
  grade: { type: Number, default: null },
  feedback: String,
  gradedAt: Date,
  gradedBy: String
});

module.exports = mongoose.model("Submission", submissionSchema);
