const mongoose = require("mongoose");

const EmergencyReportSchema = new mongoose.Schema({
  userId: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
  type: { type: String }, // medical, safety, abuse
  message: { type: String },
  location: { type: String },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("EmergencyReport", EmergencyReportSchema);
