const mongoose = require("mongoose");

// Separate from the generic Result model, which already has a
// different, currently-live shape for CATs (catId, required score,
// publishedAt/publishedBy). Same reasoning as ExamSubmission above —
// exam results have a different lifecycle (created Pending at
// submit time, graded later) that would collide with CATs' shape.
const examResultSchema = new mongoose.Schema({
  examId: { type: String, required: true },
  studentId: { type: String, required: true },
  submissionId: { type: String, required: true },
  score: { type: Number, default: null }, // null until graded
  totalMarks: { type: Number, required: true },
  status: {
    type: String,
    enum: ["Pending", "Passed", "Failed"],
    default: "Pending",
  },
  feedback: String,
  gradedBy: String,
  gradedAt: Date,
  createdAt: { type: Date, default: Date.now },
});

examResultSchema.index({ examId: 1, studentId: 1 }, { unique: true });

module.exports = mongoose.model("ExamResult", examResultSchema);
