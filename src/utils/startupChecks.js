"use strict";

// Checks the server does when it starts, so a dangerous setting is caught at once instead of discovered by an attacker.
// PURE (tests/startupChecks.test.js).
//
// The JWT secret signs every login token. Anyone who knows it can make a token for ANY account. An early version
// of this project committed a development .env, and this repository is public, so that old secret is public too.
// If production ever used it (or anything like it), logins can be forged. What is checked, and what happens:
//   - not set                              -> the server refuses to start in production
//   - the secret that was committed        -> the server refuses to start in production
//   - shorter than 32 characters, or made of few different characters -> a loud warning in the log (never a crash,
//     because a weak-but-private secret is not an emergency worth an outage)

const crypto = require("crypto");

// SHA-256 fingerprints of secrets that are known to be public. Only the fingerprint is kept here, never the secret.
const LEAKED_SECRET_FINGERPRINTS = ["311d5aa2d3f837b6a8c596d6770057bd6923c2e6ee56ba62a0b004af320d0bf4"];

const sha256 = (text) => crypto.createHash("sha256").update(String(text)).digest("hex");

function checkJwtSecret(secret, fingerprints = LEAKED_SECRET_FINGERPRINTS) {
  const fatal = [];
  const warnings = [];
  if (typeof secret !== "string" || secret.trim() === "") {
    fatal.push("JWT_SECRET is not set.");
    return { fatal, warnings };
  }
  if (fingerprints.includes(sha256(secret.trim()))) {
    fatal.push("JWT_SECRET is the development secret that was committed to the public repository. Anyone can forge logins with it. Set a new random value.");
  }
  if (secret.length < 32) warnings.push(`JWT_SECRET is only ${secret.length} characters. Use at least 32 random characters (for example: node -e "console.log(require('crypto').randomBytes(48).toString('hex'))").`);
  if (new Set(secret).size < 10) warnings.push("JWT_SECRET uses very few different characters, so it is easy to guess. Use a long random value.");
  return { fatal, warnings };
}

// env is process.env. In production a fatal problem throws; elsewhere it only warns, so local development still works.
function assertSecureStartup(env, log = console, fingerprints = LEAKED_SECRET_FINGERPRINTS) {
  const { fatal, warnings } = checkJwtSecret(env.JWT_SECRET, fingerprints);
  warnings.forEach((w) => log.warn(`[security] ${w}`));
  if (fatal.length === 0) return { ok: true, warnings };
  if (env.NODE_ENV === "production") {
    throw new Error(`Refusing to start: ${fatal.join(" ")}`);
  }
  fatal.forEach((f) => log.warn(`[security] ${f} (allowed here because NODE_ENV is not production)`));
  return { ok: false, warnings: [...fatal, ...warnings] };
}

module.exports = { checkJwtSecret, assertSecureStartup, sha256, LEAKED_SECRET_FINGERPRINTS };
