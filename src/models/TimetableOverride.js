const mongoose = require("mongoose");

// A student's personal override for ONE canonical Timetable entry.
// Does not affect any other student's view or the canonical schedule
// itself — purely a per-student replacement layer.
const timetableOverrideSchema = new mongoose.Schema({
  studentId: { type: String, required: true },
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
  originalTimetableId: { type: mongoose.Schema.Types.ObjectId, ref: "Timetable", required: true },
  dayOfWeek: {
    type: String,
    required: true,
    enum: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  },
  startTime: { type: String, required: true },
  endTime: { type: String, required: true },
  location: String,
  createdAt: { type: Date, default: Date.now },
});

// A student can only have one override per canonical entry.
timetableOverrideSchema.index({ studentId: 1, originalTimetableId: 1 }, { unique: true });

module.exports = mongoose.model("TimetableOverride", timetableOverrideSchema);
