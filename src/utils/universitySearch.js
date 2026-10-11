"use strict";

// Shared normalization for university names and user-entered search terms.
// Tokens allow searches such as "Nairobi" to match "University of Nairobi".
function normalizeUniversityName(raw) {
  return String(raw == null ? "" : raw)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

function universitySearchTokens(raw) {
  const normalized = normalizeUniversityName(raw);
  return normalized ? [...new Set(normalized.split(/\s+/))] : [];
}

function universitySearchTerm(raw) {
  const value = normalizeUniversityName(raw);
  if (value.length < 2 || value.length > 100) {
    return { ok: false, value: "" };
  }
  return { ok: true, value };
}

function escapeRegex(raw) {
  return String(raw).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function buildUniversitySearchFilters(rawSearch, rawCountry) {
  const term = universitySearchTerm(rawSearch);
  const country =
    typeof rawCountry === "string" ? rawCountry.trim() : "";

  const base = { status: "active" };
  if (country) base.country = country;

  if (!term.ok) {
    return { ok: false, fullNameFilter: null, tokenFilter: null };
  }

  const prefix = "^" + escapeRegex(term.value);

  return {
    ok: true,
    fullNameFilter: { ...base, nameSearch: { $regex: prefix } },
    tokenFilter: { ...base, nameSearchTokens: { $regex: prefix } },
  };
}

module.exports = {
  normalizeUniversityName,
  universitySearchTokens,
  universitySearchTerm,
  escapeRegex,
  buildUniversitySearchFilters,
};
