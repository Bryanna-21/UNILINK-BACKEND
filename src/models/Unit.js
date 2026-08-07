const mongoose = require("mongoose");

const unitSchema = new mongoose.Schema({
  courseId: { type: String, required: true },
  title: { type: String, required: true },
  description: String,
  order: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Unit", unitSchema);
