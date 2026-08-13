const mongoose = require("mongoose");

const lostItemSchema = new mongoose.Schema({
  itemName: { type: String, required: true },
  description: String,
  location: String,
  status: { type: String, enum: ["lost", "found"], required: true },
  imageUrl: String,
  contactInfo: String,
  reportedBy: { type: String, required: true },
  resolved: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("LostItem", lostItemSchema);
