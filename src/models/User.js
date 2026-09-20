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
  // Contacts notified when this user triggers an SOS (see
  // emergency.controller.js's reportEmergency, type "sos"). Plain
  // embedded subdocuments, not a separate collection or User
  // references — a trusted contact is very often not a UniLink user
  // at all (a parent, a sibling), just a name and phone number to
  // reach in an emergency.
  trustedContacts: [
    {
      name: { type: String, required: true },
      phone: { type: String, required: true },
      relationship: { type: String, default: "" },
      createdAt: { type: Date, default: Date.now },
    },
  ],
  // Expo push token for this device, registered on login/app-open
  // (see auth.routes.js's /register-push-token). One token per user
  // for now, not an array — a user signed in on a second device
  // simply overwrites the previous token, meaning push only reaches
  // their most recently active device. Real multi-device support
  // would need an array of {token, deviceId, lastSeenAt} instead;
  // out of scope for tonight's build.
  pushToken: { type: String, default: null },
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
