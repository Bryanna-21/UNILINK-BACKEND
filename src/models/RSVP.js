const mongoose = require("mongoose");
const crypto = require("crypto");

const rsvpSchema = new mongoose.Schema({
  eventId: { type: String, required: true },
  userId: { type: String, required: true },
  // A random token embedded in the QR code, checked against on
  // scan — not the Mongo _id itself, so a leaked/guessed _id can't
  // be used to fake a check-in.
  qrToken: {
    type: String,
    default: () => crypto.randomBytes(16).toString("hex")
  },
  checkedIn: { type: Boolean, default: false },
  checkedInAt: Date,
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("RSVP", rsvpSchema);
