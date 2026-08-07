const mongoose = require("mongoose");

const listingSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: String,
  category: {
    type: String,
    enum: ["books", "laptops", "hostels", "tutors", "services", "second_hand"],
    required: true
  },
  price: Number,
  imageUrls: { type: [String], default: [] },
  sellerId: { type: String, required: true },
  status: { type: String, enum: ["available", "sold"], default: "available" },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Listing", listingSchema);
