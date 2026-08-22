const { Resend } = require("resend");
const crypto = require("crypto");
const OtpCode = require("../models/OtpCode");

const OTP_LENGTH = 6;
const OTP_TTL_MINUTES = 10;

// Resend over HTTPS - no SMTP handshake, no socket to hang, and it
// gives us a proper thrown error object on failure instead of Gmail
// SMTP's tendency to just stall or silently drop the send.
const resend = new Resend(process.env.RESEND_API_KEY);

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

// Sends the OTP email via Resend's API. Unlike the old nodemailer/Gmail
// path, this throws a real Error with a message on failure - it does
// NOT swallow the failure or return silently, because the caller needs
// to know if the email didn't go out so it can respond to the client
// correctly rather than pretending success.
async function sendOtpEmail(toEmail, code, purpose) {
  const subject =
    purpose === "verify_signup" ? "Verify your UniLink account" : "Your UniLink login code";

  const body =
    purpose === "verify_signup"
      ? `Your UniLink verification code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes.`
      : `Your UniLink login code is ${code}. It expires in ${OTP_TTL_MINUTES} minutes. If you didn't try to log in, you can ignore this email.`;

  const { data, error } = await resend.emails.send({
    // FROM_EMAIL must be on a domain you've verified in Resend.
    // Using their shared test domain (onboarding@resend.dev) works
    // for development but is rate-limited and not meant for real users.
    from: process.env.RESEND_FROM_EMAIL || "UniLink <onboarding@resend.dev>",
    to: toEmail,
    subject,
    text: body,
  });

  if (error) {
    // Surface the real reason (bad API key, unverified domain,
    // rate limit, invalid recipient, etc.) instead of a generic
    // "email failed" the caller can't act on.
    throw new Error(`Resend failed to send OTP email: ${error.message || JSON.stringify(error)}`);
  }

  return data;
}

module.exports = { createOtp, verifyOtp, sendOtpEmail, OTP_TTL_MINUTES };
