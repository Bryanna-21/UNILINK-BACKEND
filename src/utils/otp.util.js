const SibApiV3Sdk = require("sib-api-v3-sdk");
const crypto = require("crypto");
const OtpCode = require("../models/OtpCode");

const OTP_LENGTH = 6;
const OTP_TTL_MINUTES = 10;

// Brevo client setup. Unlike the earlier Resend integration, Brevo's
// free tier allows sending to ANY recipient once a sender is verified -
// no domain required, no per-recipient sandbox restriction. The
// tradeoff (per Brevo's own warning at sender setup) is that mail from
// a free-provider sender address (e.g. a Gmail "From") is more likely
// to be filtered into spam than mail from an authenticated domain.
// That's why every email below explicitly tells the user to check
// spam - it's a real, current limitation of this setup, not boilerplate.
const defaultClient = SibApiV3Sdk.ApiClient.instance;
const apiKeyAuth = defaultClient.authentications["api-key"];
apiKeyAuth.apiKey = process.env.BREVO_API_KEY;

const transactionalEmailsApi = new SibApiV3Sdk.TransactionalEmailsApi();

// The verified sender identity. Must match exactly the "From Email"
// verified in Brevo's dashboard (Settings > Senders) - Brevo will
// reject sends from an unverified sender.
const SENDER = {
  name: "UniLink",
  email: process.env.BREVO_SENDER_EMAIL,
};

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
// mean two live codes for the same request with no way for the user
// to know which one is current.
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

// Purpose -> (subject, body-intro) mapping. Each purpose gets wording
// specific to what triggered it, so a user who didn't request a
// password change but receives one of these emails has enough context
// to recognize something is wrong.
//
// "new_device_login" and "password_change" are new purposes beyond
// the original signup/2FA pair - callers create OTPs with these
// purpose strings the same way as the existing ones, and verifyOtp
// checks them the same way. No schema change needed since `purpose`
// was already a free-text field on OtpCode.
const EMAIL_COPY = {
  verify_signup: {
    subject: "Verify your UniLink account",
    intro: (code) => `Your UniLink verification code is ${code}.`,
  },
  login_2fa: {
    subject: "Your UniLink login code",
    intro: (code) =>
      `Your UniLink login code is ${code}. If you didn't try to log in, you can ignore this email.`,
  },
  new_device_login: {
    subject: "Confirm sign-in from a new device",
    intro: (code) =>
      `We noticed a login attempt from a device we don't recognize. Your confirmation code is ${code}. If this wasn't you, do not share this code with anyone and consider changing your password.`,
  },
  password_change: {
    subject: "Confirm your UniLink password change",
    intro: (code) =>
      `Your code to confirm this password change is ${code}. If you didn't request a password change, ignore this email and your password will remain unchanged.`,
  },
};

// Sends the OTP email via Brevo's API. Throws a real Error with a
// message on failure - it does NOT swallow the failure or return
// silently, because the caller needs to know if the email didn't go
// out so it can respond to the client correctly rather than
// pretending success.
async function sendOtpEmail(toEmail, code, purpose) {
  const copy = EMAIL_COPY[purpose];
  if (!copy) {
    // Fail loudly on an unrecognized purpose rather than silently
    // sending a generic email - a typo'd purpose string should be
    // caught during development, not shipped as a confusing email.
    throw new Error(`sendOtpEmail: unrecognized purpose "${purpose}"`);
  }

  const body =
    `${copy.intro(code)}\n\n` +
    `This code expires in ${OTP_TTL_MINUTES} minutes.\n\n` +
    `Can't find this email? Please check your spam or junk folder - ` +
    `emails from UniLink can sometimes be filtered there while our ` +
    `sending domain is still being set up.`;

  const sendSmtpEmail = new SibApiV3Sdk.SendSmtpEmail();
  sendSmtpEmail.subject = copy.subject;
  sendSmtpEmail.sender = SENDER;
  sendSmtpEmail.to = [{ email: toEmail }];
  sendSmtpEmail.textContent = body;

  try {
    await transactionalEmailsApi.sendTransacEmail(sendSmtpEmail);
  } catch (error) {
    // Brevo's SDK errors carry the real reason in error.response.body
    // (or error.message as a fallback) - surface it rather than a
    // generic "email failed" the caller can't act on.
    const reason =
      (error.response && error.response.body && JSON.stringify(error.response.body)) ||
      error.message ||
      "unknown error";
    throw new Error(`Brevo failed to send OTP email: ${reason}`);
  }
}

module.exports = { createOtp, verifyOtp, sendOtpEmail, OTP_TTL_MINUTES };
