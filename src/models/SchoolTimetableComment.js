const mongoose = require("mongoose");

const schema = new mongoose.Schema({
  timetableId: { type: String, required: true, index: true },
  version: { type: Number, default: 1 },
  userId: { type: String, required: true },
  userName: { type: String, default: "" },
  role: { type: String, default: "" },
  text: { type: String, required: true, maxlength: 1000 },
  createdAt: { type: Date, default: Date.now, index: true },
});

module.exports = mongoose.model("SchoolTimetableComment", schema);
