"use strict";

// Who may act on which university. A superadmin, and an admin with NO university assigned
// ("platform admin"), may act on any university. An admin assigned to a university may only act
// on that one. Every rule here is pure so it can be tested without a database.

const GLOBAL = "GLOBAL"; // announcements for every university

const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

function clampInt(value, def, min, max) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(n, min), max);
}

// Trimmed string within 1..max characters, else null.
function cleanText(value, max) {
  if (typeof value !== "string") return null;
  const t = value.replace(/\r\n/g, "\n").trim();
  return t && t.length <= max ? t : null;
}

const isValidEmail = (v) => typeof v === "string" && v.length <= 254 && /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(v);

const isUnassigned = (actor) => actor.role === "superadmin" || !actor.universityId;

// Which university a write targets. Returns { ok, universityId } or { ok:false, status, message }.
function resolveUniversity(actor, requested) {
  const want = requested ? String(requested) : "";
  if (isUnassigned(actor)) {
    return want && want !== GLOBAL ? { ok: true, universityId: want } : { ok: false, status: 400, message: "Choose a university." };
  }
  if (!want || want === String(actor.universityId)) return { ok: true, universityId: String(actor.universityId) };
  return { ok: false, status: 403, message: "You can only manage your own university." };
}

// Mongo filter limiting a collection that has a universityId field.
function scopeFilter(actor) {
  return isUnassigned(actor) ? {} : { universityId: String(actor.universityId) };
}

function inScope(actor, universityId) {
  return isUnassigned(actor) || String(universityId) === String(actor.universityId);
}

// UniLink-wide announcements: superadmin or a platform admin only.
const canPostGlobal = (actor) => isUnassigned(actor);

module.exports = { GLOBAL, escapeRegex, clampInt, cleanText, isValidEmail, resolveUniversity, scopeFilter, inScope, canPostGlobal, isUnassigned };
