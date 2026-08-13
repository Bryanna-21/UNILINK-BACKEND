const mongoose = require("mongoose");

const attendanceSchema = new mongoose.Schema({
  studentId: { type: String, required: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
  // Calendar date the student is signing attendance FOR (not the
  // signing timestamp) — e.g. "2026-08-10". Keeps signing tied to a
  // real class day rather than an arbitrary free-floating timestamp.
  date: { type: String, required: true },
  signedAt: { type: Date, default: Date.now },
});

// One signature per student, per course, per date — the actual
// safeguard against duplicate or backdated-indefinitely sign-ins.
attendanceSchema.index({ studentId: 1, courseId: 1, date: 1 }, { unique: true });

module.exports = mongoose.model("Attendance", attendanceSchema);
