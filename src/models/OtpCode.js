const mongoose = require("mongoose");
// Shared by four features: signup email verification, optional login
// 2FA, password-change confirmation, and new-device login
// confirmation. `purpose` distinguishes which flow a given code
// belongs to, so a code generated for one flow can't accidentally be
// accepted to complete a different one.
const otpCodeSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  code: { type: String, required: true },
  purpose: {
    type: String,
    enum: ["verify_signup", "login_2fa", "password_change", "new_device_login", "password_reset"],
    required: true,
  },
  used: { type: Boolean, default: false },
  expiresAt: { type: Date, required: true },
  createdAt: { type: Date, default: Date.now },
});
// TTL index: MongoDB automatically deletes documents once expiresAt
// has passed, so expired/unused codes don't pile up in the collection
// forever. This is cleanup only - the actual expiry CHECK still
// happens in application code at verify time (see otp.util.js),
// since Mongo's TTL sweep runs on its own schedule (up to a 60s lag)
// and isn't precise enough to be the real enforcement mechanism.
otpCodeSchema.index({ expiresAt: 1 }, { expireAfterSeconds: 0 });
module.exports = mongoose.model("OtpCode", otpCodeSchema);
