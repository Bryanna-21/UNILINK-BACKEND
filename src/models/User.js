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
  // Holds the new (already-hashed) password while a password-change
  // request is awaiting OTP confirmation. Set in
  // /request-password-change, promoted to `password` and cleared in
  // /confirm-password-change. Never populated outside that flow.
  pendingPasswordHash: { type: String, default: undefined },
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model("User", userSchema);
