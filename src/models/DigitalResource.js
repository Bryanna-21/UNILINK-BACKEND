const mongoose = require("mongoose");

const digitalResourceSchema = new mongoose.Schema({
  title: { type: String, required: true },
  author: String,
  category: { type: String, enum: ["research_paper", "book", "article"], default: "research_paper" },
  fileUrl: { type: String, required: true },
  uploadedBy: String,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("DigitalResource", digitalResourceSchema);
