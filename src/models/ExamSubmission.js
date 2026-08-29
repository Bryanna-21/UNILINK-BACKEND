const mongoose = require("mongoose");

// Deliberately a separate model from the generic Submission model —
// that model already has a different shape in active use by the
// Assignments feature (assignmentId, textAnswer). Exam submissions
// have a different shape (multiple structured answers) and a
// different semantic (one-time, timed, auto-locked at submit) —
// forcing them into the same collection would collide with a
// currently-live feature, not just be confusing.
const answerSchema = new mongoose.Schema(
  {
    questionId: { type: String, required: true },
    answer: { type: String, default: "" },
  },
  { _id: false }
);

const examSubmissionSchema = new mongoose.Schema({
  examId: { type: String, required: true },
  studentId: { type: String, required: true },
  answers: [answerSchema],
  submittedAt: { type: Date, default: Date.now },
});

examSubmissionSchema.index({ examId: 1, studentId: 1 }, { unique: true });

module.exports = mongoose.model("ExamSubmission", examSubmissionSchema);
