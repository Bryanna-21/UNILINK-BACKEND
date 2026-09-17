const mongoose = require("mongoose");
const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  universityId: String,
  role: { type: String, default: "student" },
  status: { type: String, enum: ["active", "suspended"], default: "active" },
  // Student admission/registration number. Optional and student-only
  // in practice (lecturers/admins have no use for it) but not
  // enforced at the schema level, same laxness as other optional
  // profile fields here (bio, phone). Added for exam-grading views
  // (ViewSubmission.js) that need to identify a student beyond name/
  // email; not used for authentication or lookups anywhere.
  admissionNumber: { type: String, default: "" },
  // New fields for OTP verification and optional login 2FA.
  // isVerified starts false — an account can't log in at all until
  // its signup OTP is confirmed (see auth.routes.js's /login check).
  // twoFactorEnabled is opt-in, off by default, toggled from Settings.
  isVerified: { type: Boolean, default: false },
  twoFactorEnabled: { type: Boolean, default: false },
  // Profile picture and cover photo. Both are Cloudinary secure URLs,
  // same pattern as Portfolio's resumeUrl/certificate fileUrl — never
  // store the raw upload, only the hosted URL. Optional: a new user
  // has neither until they explicitly upload one.
  avatarUrl: { type: String, default: null },
  coverUrl: { type: String, default: null },
  bio: { type: String, default: "" },
  phone: { type: String, default: "" },
  // Holds the new (already-hashed) password while a password-change
  // request is awaiting OTP confirmation. Set in
  // /request-password-change, promoted to `password` and cleared in
  // /confirm-password-change. Never populated outside that flow.
  pendingPasswordHash: { type: String, default: undefined },
    pendingResetPasswordHash: { type: String, default: undefined },
  tokenVersion: { type: Number, default: 0 }, 
  createdAt: { type: Date, default: Date.now }
});
module.exports = mongoose.model("User", userSchema);
