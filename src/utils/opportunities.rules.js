"use strict";

// Validation for loan and sponsorship listings. Pure, so it is tested without a database.
const { cleanText } = require("./adminScope");

const TYPES = ["loan", "sponsorship"];

// https only, no embedded credentials, no whitespace. The app opens this link, so anything else
// (javascript:, intent:, http:, user:pass@host) is refused.
function cleanHttpsUrl(value) {
  if (typeof value !== "string") return null;
  const s = value.trim();
  if (!s || s.length > 500 || /\s/.test(s)) return null;
  let u;
  try {
    u = new URL(s);
  } catch {
    return null;
  }
  return u.protocol === "https:" && !u.username && !u.password ? s : null;
}

// "YYYY-MM-DD" -> the end of that day (UTC), or null if it is not a real calendar date.
function parseDeadline(value) {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
  const d = new Date(`${value}T23:59:59.999Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().startsWith(value) ? d : null;
}

const isActive = (deadline, now = new Date()) => !deadline || new Date(deadline) >= now;

// Returns { ok: true, value } or { ok: false, message }.
function parseOpportunity(body, now = new Date()) {
  const b = body || {};
  if (!TYPES.includes(b.type)) return { ok: false, message: "Choose loan or sponsorship." };
  const title = cleanText(b.title, 150);
  if (!title) return { ok: false, message: "A title is required (150 characters at most)." };
  const provider = cleanText(b.provider, 120);
  if (!provider) return { ok: false, message: "Say who is offering it (120 characters at most)." };
  const description = cleanText(b.description, 2000);
  if (!description) return { ok: false, message: "A description is required (2000 characters at most)." };

  const optional = (v, max, what) => {
    if (v === undefined || v === null || v === "") return { value: "" };
    const t = cleanText(v, max);
    return t ? { value: t } : { error: `${what} is too long (${max} characters at most).` };
  };
  const eligibility = optional(b.eligibility, 1000, "Eligibility");
  if (eligibility.error) return { ok: false, message: eligibility.error };
  const amountText = optional(b.amountText, 80, "The amount");
  if (amountText.error) return { ok: false, message: amountText.error };

  let link = "";
  if (b.link !== undefined && b.link !== null && b.link !== "") {
    link = cleanHttpsUrl(b.link);
    if (!link) return { ok: false, message: "The link must be a full https:// address." };
  }

  let deadline = null;
  if (b.deadline !== undefined && b.deadline !== null && b.deadline !== "") {
    deadline = parseDeadline(b.deadline);
    if (!deadline) return { ok: false, message: "The deadline must be a real date (YYYY-MM-DD)." };
    if (deadline < now) return { ok: false, message: "The deadline has already passed." };
  }

  return { ok: true, value: { type: b.type, title, provider, description, eligibility: eligibility.value, amountText: amountText.value, link, deadline } };
}

module.exports = { TYPES, cleanHttpsUrl, parseDeadline, isActive, parseOpportunity };
