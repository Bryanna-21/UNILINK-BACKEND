const mongoose = require("mongoose");

const achievementSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  title: { type: String, required: true },
  description: String,
  iconUrl: String,
  awardedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Achievement", achievementSchema);
