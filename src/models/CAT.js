const mongoose = require("mongoose");

const catSchema = new mongoose.Schema({
  courseId: { type: String, required: true },
  unitId: String,
  title: { type: String, required: true },
  date: Date,
  venue: String,
  coverage: String,
  maxScore: { type: Number, default: 30 },
  createdBy: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("CAT", catSchema);
