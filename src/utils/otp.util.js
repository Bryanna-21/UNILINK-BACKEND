const nodemailer = require("nodemailer");
const crypto = require("crypto");
const OtpCode = require("../models/OtpCode");

const OTP_LENGTH = 6;
const OTP_TTL_MINUTES = 10;

// Gmail SMTP via a dedicated sending account's app password (not the
// account's normal login password - see GMAIL_APP_PASSWORD in
// Render's env vars). This account is used only for outbound
// transactional email, kept separate from any personal account.
//
// Using explicit SMTP config (not the "service: gmail" shorthand) with
// a generous timeout — Render's outbound connections to Gmail's SMTP
// ports have shown a "Connection timeout" failure, worth ruling out
// whether that's the shorthand's default timeout being too aggressive
// versus a genuine network-level block on this host.
const transporter = nodemailer.createTransport({
  host: "smtp.gmail.com",
  port: 465,
  secure: true,
  auth: {
    user: process.env.GMAIL_SENDER_EMAIL,
    pass: process.env.GMAIL_APP_PASSWORD,
  },
  connectionTimeout: 20000,
  greetingTimeout: 20000,
  socketTimeout: 20000,
});

// crypto.randomInt is cryptographically secure, unlike Math.random -
// worth using here since this is an auth-security code, not a
// cosmetic random value.
function generateOtpDigits() {
  return crypto.randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, "0");
}

// Creates and persists a new OTP for a user/purpose, invalidating any
// prior unused codes for that same user+purpose first - otherwise an
// old code from a previous request could still be sitting in the
// collection and technically valid until its own expiry, which would
// mean two live codes for the same login attempt with no way for the
// user to know which one is current.
async function createOtp(userId, purpose) {
  await OtpCode.updateMany({ userId, purpose, used: false }, { $set: { used: true } });

  const code = generateOtpDigits();
  const expiresAt = new Date(Date.now() + OTP_TTL_MINUTES * 60 * 1000);

  await OtpCode.create({ userId, code, purpose, expiresAt });
  return code;
}

// Checks a submitted code against the most recent unused, unexpired
// code for this user/purpose. Marks it used on success so it can't be
// replayed. Returns true/false rather than throwing, since "wrong
// code" is an expected, common outcome here, not an exceptional one.
async function verifyOtp(userId, purpose, submittedCode) {
  const record = await OtpCode.findOne({
    userId,
    purpose,
    used: false,
    expiresAt: { $gt: new Date() },
  }).sort({ createdAt: -1 });

  if (!record || record.code !== submittedCode) {
    return false;
  }

  record.used = true;
  await record.save();
  return true;
}

async function sendOtpEmail(toEmail, code, purpose) {
  const subject =
    purpose === "verify_signup" ? "Verify your UniLink account" : "Your UniLink login code";

  const body =
    purpose === "verify_signup"
      ? `Your UniLink verification code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.`
      : `Your UniLink login code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes. If you didn't try to log in, you can ignore this email.`;

  await transporter.sendMail({
    from: `"UniLink" <${process.env.GMAIL_SENDER_EMAIL}>`,
    to: toEmail,
    subject,
    text: body,
  });
}

module.exports = { createOtp, verifyOtp, sendOtpEmail, OTP_TTL_MINUTES };
