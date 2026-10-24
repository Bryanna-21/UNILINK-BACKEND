"use strict";

// How long a login token lasts. It used to be a hard-coded 24 hours, which signed every student out
// roughly once a day (any request after that returns "Invalid token" and the app wipes its session).
// Now JWT_EXPIRES_IN can set it ("30d", "12h", or seconds). Default 30 days; anything unreadable,
// under 1 hour or over 90 days falls back to the default rather than silently weakening security.
//
// Revocation still works the same way: a password change or removal bumps tokenVersion, and the auth
// middleware checks account status on every request, so a longer lifetime does not keep a closed
// account signed in.

const DEFAULT = "30d";
const UNIT_SECONDS = { s: 1, m: 60, h: 3600, d: 86400 };
const MIN_SECONDS = 3600;
const MAX_SECONDS = 90 * 86400;

function toSeconds(raw) {
  const text = String(raw ?? "").trim().toLowerCase();
  const match = /^(\d+)\s*([smhd]?)$/.exec(text);
  if (!match) return null;
  const n = Number(match[1]);
  return match[2] ? n * UNIT_SECONDS[match[2]] : n;
}

function resolveJwtExpiry(raw) {
  if (raw === undefined || raw === null || String(raw).trim() === "") return DEFAULT;
  const seconds = toSeconds(raw);
  if (seconds === null || seconds < MIN_SECONDS || seconds > MAX_SECONDS) return DEFAULT;
  return String(raw).trim().toLowerCase().replace(/\s+/g, "");
}

module.exports = { resolveJwtExpiry, DEFAULT_EXPIRY: DEFAULT };
