const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  universityId: String,
  role: { type: String, default: "student" },
  status: { type: String, enum: ["active", "suspended"], default: "active" },
  // New fields for OTP verification and optional login 2FA.
  // isVerified starts false — an account can't log in at all until
  // its signup OTP is confirmed (see auth.routes.js's /login check).
  // twoFactorEnabled is opt-in, off by default, toggled from Settings.
  isVerified: { type: Boolean, default: false },
  twoFactorEnabled: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("User", userSchema);
