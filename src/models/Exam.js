const mongoose = require("mongoose");

// One question within an exam. `options` only applies to mcq;
// `correctAnswer` is used for auto-grading mcq/truefalse at submit
// time — essay/short questions are always left for manual grading,
// since there's no way to auto-score free text correctly.
const questionSchema = new mongoose.Schema(
  {
    text: { type: String, required: true },
    type: {
      type: String,
      enum: ["mcq", "truefalse", "essay", "short"],
      required: true,
    },
    options: [String],
    correctAnswer: String,
    marks: { type: Number, default: 1 },
  },
  { _id: true }
);

const examSchema = new mongoose.Schema({
  title: { type: String, required: true },
  courseId: { type: String, required: true },
  status: {
    type: String,
    enum: ["Upcoming", "Published", "Completed"],
    default: "Upcoming",
  },
  duration: { type: Number, required: true }, // minutes
  passMark: { type: Number, default: 50 }, // percentage
  questions: [questionSchema],
  createdBy: String,
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Exam", examSchema);
