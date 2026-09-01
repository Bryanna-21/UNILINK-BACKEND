const mongoose = require("mongoose");

// One question within an exam. `options` only applies to mcq;
// `correctAnswer` is used for auto-grading mcq/truefalse at submit
// time — essay/short questions are always left for manual grading,
// since there's no way to auto-score free text correctly.
//
// NOTE: frontend's QuestionBuilder currently sends `answer`, not
// `correctAnswer` — that mismatch must be fixed in QuestionItem.js /
// QuestionOptions.js (wherever the field is actually set) before this
// schema is wired up, or every question's correct answer is silently
// dropped on save.
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
  description: { type: String, default: "" },
  instructions: { type: String, default: "" },

  // Kept as String to match Course.js / existing convention
  // (universityId, lecturerId, enrolledStudentIds are all String).
  // Changing this to an ObjectId ref would be inconsistent with the
  // rest of the schema and is a separate, larger decision.
  courseId: { type: String, required: true },
  unit: { type: String, default: "" },

  createdBy: { type: String, required: true }, // lecturer's userId

  status: {
    type: String,
    enum: ["Draft", "Upcoming", "Published", "Completed", "Archived"],
    default: "Draft",
  },

  duration: { type: Number, required: true }, // minutes
  startTime: { type: Date, default: null },
  endTime: { type: Date, default: null },

  passMark: { type: Number, default: 50 }, // percentage

  allowRetake: { type: Boolean, default: false },
  shuffleQuestions: { type: Boolean, default: false },
  showResultsImmediately: { type: Boolean, default: false },

  questions: [questionSchema],

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

// Keep updatedAt honest on every save.
examSchema.pre("save", function (next) {
  this.updatedAt = Date.now();
  next();
});

module.exports = mongoose.model("Exam", examSchema);
