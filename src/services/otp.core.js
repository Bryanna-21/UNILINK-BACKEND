"use strict";

// One-time codes: creating them and checking them. The model is injected, so this is unit-tested without a
// database (tests/otp.core.test.js). Three protections that the code did not have before:
//   1. A code is stored as a keyed hash, not as the 6 digits, so reading the database does not reveal live codes.
//      (A code made before this change is plain digits; it is still accepted until it expires, in 10 minutes.)
//   2. Five wrong guesses burn the code: nobody can try a million combinations against one code.
//   3. Codes are compared in constant time, and only text of exactly the right shape is ever looked up.

const crypto = require("crypto");

const OTP_LENGTH = 6;
const OTP_TTL_MINUTES = 10;
const MAX_ATTEMPTS = 5;

const isId = (x) => typeof x === "string" && /^[a-f\d]{24}$/i.test(x);

function makeOtpCore({ OtpCode, secret = () => process.env.JWT_SECRET || "", now = () => new Date() }) {
  const hashCode = (code, userId, purpose) =>
    crypto.createHmac("sha256", String(secret())).update(`${userId}|${purpose}|${code}`).digest("hex");

  const equalText = (a, b) => {
    const x = Buffer.from(String(a));
    const y = Buffer.from(String(b));
    return x.length === y.length && crypto.timingSafeEqual(x, y);
  };

  function generateDigits() {
    return crypto.randomInt(0, 10 ** OTP_LENGTH).toString().padStart(OTP_LENGTH, "0");
  }

  async function createOtp(userId, purpose) {
    if (!isId(userId)) throw new Error("createOtp needs a user id as text");
    await OtpCode.updateMany({ userId, purpose, used: false }, { $set: { used: true } });
    const code = generateDigits();
    const expiresAt = new Date(now().getTime() + OTP_TTL_MINUTES * 60 * 1000);
    await OtpCode.create({ userId, code: hashCode(code, userId, purpose), purpose, expiresAt, attempts: 0 });
    return code;
  }

  async function verifyOtp(userId, purpose, submittedCode) {
    // Anything that is not plain text of the right shape can never be a real answer, and must never reach a query.
    if (!isId(userId) || typeof purpose !== "string" || typeof submittedCode !== "string" || !/^\d{6}$/.test(submittedCode)) return false;

    const record = await OtpCode.findOne({ userId, purpose, used: false, expiresAt: { $gt: now() } }).sort({ createdAt: -1 });
    if (!record) return false;

    if ((record.attempts || 0) >= MAX_ATTEMPTS) {
      record.used = true;
      await record.save();
      return false;
    }

    const stored = String(record.code);
    const legacy = /^\d{6}$/.test(stored); // made before codes were hashed
    const good = legacy ? equalText(stored, submittedCode) : equalText(stored, hashCode(submittedCode, userId, purpose));

    if (!good) {
      record.attempts = (record.attempts || 0) + 1;
      if (record.attempts >= MAX_ATTEMPTS) record.used = true;
      await record.save();
      return false;
    }

    record.used = true;
    await record.save();
    return true;
  }

  return { createOtp, verifyOtp, hashCode, OTP_LENGTH, OTP_TTL_MINUTES, MAX_ATTEMPTS };
}

module.exports = { makeOtpCore, OTP_LENGTH, OTP_TTL_MINUTES, MAX_ATTEMPTS };
