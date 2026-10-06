"use strict";

// Pure username rules. No database, no mongoose: everything here is unit-tested.
// Usernames are stored lowercase only, so "Bryanna" and "bryanna" can never coexist
// and nobody can impersonate someone with a different capitalisation.

const MIN_LENGTH = 3;
const MAX_LENGTH = 20;

const RESERVED = new Set([
  "admin", "administrator", "superadmin", "root", "system", "support", "help",
  "unilink", "moderator", "mod", "staff", "official", "safety", "security",
  "api", "null", "undefined", "me", "you", "everyone", "anonymous",
]);
// admin1, unilink_2, support.01 ... look official too.
const RESERVED_PATTERN = /^(admin|administrator|superadmin|moderator|unilink|support|staff|official)[._]?\d*$/;

const normalize = (raw) =>
  String(raw === undefined || raw === null ? "" : raw)
    .trim()
    .replace(/^@+/, "")
    .toLowerCase();

const bad = (message) => ({ ok: false, message });

function validate(raw) {
  const value = normalize(raw);
  if (value.length < MIN_LENGTH) return bad(`A username needs at least ${MIN_LENGTH} characters.`);
  if (value.length > MAX_LENGTH) return bad(`A username can be at most ${MAX_LENGTH} characters.`);
  if (!/^[a-z0-9_.]+$/.test(value)) return bad("Use only letters, numbers, dots and underscores.");
  if (!/^[a-z0-9]/.test(value)) return bad("A username must start with a letter or a number.");
  if (value.includes("..") || value.endsWith(".")) {
    return bad("A username can't contain two dots in a row or end with a dot.");
  }
  if (RESERVED.has(value) || RESERVED_PATTERN.test(value)) return bad("That username isn't available.");
  return { ok: true, value };
}

// What the search box may send. Deliberately looser than validate(): searching "adm"
// must work even though "admin" can't be registered. Only characters that can appear
// in a username are allowed through, so the value is safe to anchor in a prefix query.
function searchTerm(raw) {
  const value = normalize(raw);
  if (value.length < MIN_LENGTH || value.length > MAX_LENGTH) return { ok: false };
  if (!/^[a-z0-9_.]+$/.test(value)) return { ok: false };
  return { ok: true, value };
}

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

const slug = (text) =>
  String(text || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "_")
    .replace(/^_+|_+$/g, "");

const digits = (random, n) => {
  let out = "";
  for (let i = 0; i < n; i += 1) out += Math.floor(random() * 10);
  return out;
};

function baseFrom(name, email) {
  const local = String(email || "").split("@")[0];
  let base = slug(name) || slug(local) || "student";
  base = base.slice(0, MAX_LENGTH).replace(/[._]+$/g, "");
  if (base.length < MIN_LENGTH) base = base + "1".repeat(MIN_LENGTH - base.length);
  return base;
}

// isTaken is async (username) => boolean. Always returns a valid, currently-free
// username; the unique index remains the final arbiter if two signups race.
async function generateUsername({ name, email, isTaken, random = Math.random }) {
  const base = baseFrom(name, email);
  const usable = async (candidate) => validate(candidate).ok && !(await isTaken(candidate));

  if (await usable(base)) return base;

  const tries = [2, 2, 2, 2, 3, 3, 3, 3, 4, 4, 4, 4];
  for (const n of tries) {
    const stem = base.slice(0, MAX_LENGTH - n).replace(/[._]+$/g, "");
    const candidate = `${stem}${digits(random, n)}`;
    if (await usable(candidate)) return candidate;
  }
  for (let i = 0; i < 5; i += 1) {
    const candidate = `user${digits(random, 8)}`;
    if (await usable(candidate)) return candidate;
  }
  throw new Error("Could not generate a free username");
}

module.exports = {
  MIN_LENGTH, MAX_LENGTH, normalize, validate, searchTerm, escapeRegex, generateUsername, baseFrom,
};
