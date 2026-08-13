const mongoose = require("mongoose");

const timetableSchema = new mongoose.Schema({
  courseId: { type: mongoose.Schema.Types.ObjectId, ref: "Course", required: true },
  dayOfWeek: {
    type: String,
    required: true,
    enum: ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"],
  },
  startTime: { type: String, required: true }, // "07:00" 24hr format
  endTime: { type: String, required: true },   // "09:00" 24hr format
  location: String,
  setByLecturerId: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Timetable", timetableSchema);
