"use strict";

// Strict reading of what a client sent. A JSON body can carry an object where a text value is expected, and an
// object like {"$ne": null} reaching a database query turns "this user" into "any user". Everything that goes
// into a lookup in the sign-in flow is checked to be plain text of the right shape first. PURE (tests/authInput.test.js).

const isObjectIdString = (x) => typeof x === "string" && /^[a-f\d]{24}$/i.test(x);

// A 6-digit one-time code, as text.
const isOtpCode = (x) => typeof x === "string" && /^\d{6}$/.test(x);

// An email address as text, trimmed and lower-cased, or null. Not a full address check, just "text that looks
// like an address and is not absurdly long".
function cleanEmail(x) {
  if (typeof x !== "string") return null;
  const e = x.trim().toLowerCase();
  if (e.length < 5 || e.length > 254) return null;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(e) ? e : null;
}

// Plain text of a reasonable length, or null.
function cleanText(x, { min = 1, max = 200 } = {}) {
  if (typeof x !== "string") return null;
  return x.length >= min && x.length <= max ? x : null;
}

module.exports = { isObjectIdString, isOtpCode, cleanEmail, cleanText };
