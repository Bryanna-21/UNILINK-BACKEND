const mongoose = require("mongoose");

// One vote per lecturer per round (version). A revised timetable starts a fresh round.
const schema = new mongoose.Schema({
  timetableId: { type: String, required: true },
  version: { type: Number, required: true },
  userId: { type: String, required: true },
  userName: { type: String, default: "" },
  role: { type: String, enum: ["lecturer", "student"], default: "lecturer" },
  vote: { type: String, enum: ["approve", "object"], required: true },
  reason: { type: String, default: "", maxlength: 500 },
  updatedAt: { type: Date, default: Date.now },
});
schema.index({ timetableId: 1, userId: 1, version: 1 }, { unique: true });

module.exports = mongoose.model("SchoolTimetableVote", schema);
