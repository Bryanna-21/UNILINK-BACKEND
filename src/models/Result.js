const mongoose = require("mongoose");

const resultSchema = new mongoose.Schema({
  catId: { type: String, required: true },
  studentId: { type: String, required: true },
  score: { type: Number, required: true },
  feedback: String,
  publishedAt: { type: Date, default: Date.now },
  publishedBy: String
});

module.exports = mongoose.model("Result", resultSchema);
