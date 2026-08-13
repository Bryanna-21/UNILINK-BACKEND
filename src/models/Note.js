const mongoose = require("mongoose");

const noteSchema = new mongoose.Schema({
  courseId: { type: String, required: true },
  unitId: String,
  title: { type: String, required: true },
  fileUrl: { type: String, required: true },
  fileType: { type: String, enum: ["pdf", "image"], default: "pdf" },
  uploadedBy: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Note", noteSchema);
