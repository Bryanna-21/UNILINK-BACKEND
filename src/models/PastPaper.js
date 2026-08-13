const mongoose = require("mongoose");

const pastPaperSchema = new mongoose.Schema({
  courseId: { type: String, required: true },
  title: { type: String, required: true },
  year: Number,
  fileUrl: { type: String, required: true },
  markingSchemeUrl: String,
  uploadedBy: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("PastPaper", pastPaperSchema);
