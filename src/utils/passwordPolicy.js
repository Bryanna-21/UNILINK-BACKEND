"use strict";

// What counts as an acceptable NEW password (register, reset, change). Existing passwords keep working: this only
// applies when a password is being set. PURE (tests/passwordPolicy.test.js).
//
// The rules are the ones that actually stop guessing: long enough, not a very common password (also with digits or
// "!" added at the end, the way people do), not a keyboard or counting run, not made of one character, not built from
// the person's own name or email, and not only digits (phone numbers and dates).

const MIN = 8;
const MAX = 128;

// Bases of the most common passwords (lower case, without trailing digits or symbols). "password1", "Password123!"
// and "PASSWORD" all reduce to "password".
const COMMON_BASES = new Set([
  "password", "passw0rd", "passcode", "letmein", "welcome", "admin", "administrator", "root", "login", "master",
  "qwerty", "qwertyuiop", "qwertyui", "asdfgh", "asdfghjkl", "zxcvbn", "zxcvbnm", "azerty", "1q2w3e", "abc",
  "iloveyou", "iloveu", "ilovegod", "godisgood", "jesus", "blessed", "blessing", "hallelujah", "princess", "sunshine",
  "monkey", "dragon", "football", "baseball", "superman", "batman", "trustno", "shadow", "michael", "jordan",
  "unilink", "unilinkke", "student", "students", "university", "campus", "nairobi", "kenya", "mombasa", "kisumu",
  "changeme", "default", "secret", "test", "testing", "guest", "user", "hello", "hello123", "love", "lovely",
  "mypassword", "newpassword", "pass", "pass1234", "abcd", "abcdef", "abcdefgh", "abc123", "welcome1",
]);

const KEYBOARD_RUNS = ["qwertyuiop", "asdfghjkl", "zxcvbnm", "1234567890", "0987654321", "abcdefghijklmnopqrstuvwxyz"];

const clean = (s) => String(s || "").toLowerCase();

function isRun(text) {
  const t = clean(text);
  if (t.length < 6) return false;
  const rev = [...t].reverse().join("");
  return KEYBOARD_RUNS.some((run) => run.includes(t) || run.includes(rev));
}

// "Password123!" -> "password"
function baseOf(password) {
  return clean(password).replace(/[^a-z]+$/g, "").replace(/^[^a-z]+/g, "");
}

function checkPassword(password, { email, name } = {}) {
  if (typeof password !== "string") return { ok: false, message: "Choose a password." };
  if (password.length < MIN) return { ok: false, message: `Password must be at least ${MIN} characters long.` };
  if (password.length > MAX) return { ok: false, message: `Password is too long (${MAX} characters at most).` };

  const lower = clean(password);
  if (new Set(lower).size === 1) return { ok: false, message: "That password is too simple. Mix letters and numbers." };
  if (/^\d+$/.test(password)) return { ok: false, message: "A password of only numbers is easy to guess. Add letters." };
  if (isRun(password)) return { ok: false, message: "That is a keyboard or counting pattern, which is easy to guess. Choose something less predictable." };
  if (COMMON_BASES.has(baseOf(password)) || COMMON_BASES.has(lower)) {
    return { ok: false, message: "That password is very common and easy to guess. Choose something less predictable." };
  }

  const local = clean(email).split("@")[0];
  if (local.length >= 4 && lower.includes(local)) return { ok: false, message: "Your password should not contain your email address." };
  const parts = clean(name).split(/[^a-z]+/).filter((p) => p.length >= 4);
  if (parts.some((p) => lower.includes(p))) return { ok: false, message: "Your password should not contain your name." };

  return { ok: true };
}

module.exports = { checkPassword, MIN, MAX, COMMON_BASES };
