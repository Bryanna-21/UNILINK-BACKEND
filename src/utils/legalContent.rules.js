"use strict";

// Pure rules for legal text: filling in the details only the owner can supply, and normalising where an
// acknowledgement came from. No database in here.
//
// Rule: a placeholder is NEVER silently invented. If the owner has not supplied a value, the text shows an obvious
// "[Owner to provide: ...]" marker and the item is listed in `openItems`, so an unfinished notice cannot be mistaken
// for a finished one.

// key -> environment variable and a human label
const PLACEHOLDERS = {
  OPERATOR_NAME: { env: "LEGAL_OPERATOR_NAME", label: "legal name of the operator (person or company that runs UniLink)" },
  CONTACT_EMAIL: { env: "LEGAL_CONTACT_EMAIL", label: "contact email for privacy questions and rights requests" },
  POSTAL_ADDRESS: { env: "LEGAL_POSTAL_ADDRESS", label: "postal or physical address of the operator" },
  ODPC_REGISTRATION: { env: "LEGAL_ODPC_REGISTRATION", label: "ODPC registration number, or a statement that registration is not required (confirm with a Kenyan lawyer)" },
  DPO_CONTACT: { env: "LEGAL_DPO_CONTACT", label: "data protection officer contact, if one is appointed" },
  HOSTING_LOCATIONS: { env: "LEGAL_HOSTING_LOCATIONS", label: "countries where the API host, database and file storage actually run" },
  RETENTION_PERIODS: { env: "LEGAL_RETENTION_PERIODS", label: "how long safety reports, moderation records and backups are kept" },
  AGE_POLICY: { env: "LEGAL_AGE_POLICY", label: "minimum age and how under-18 users are handled (guardian consent), decided with a lawyer" },
};

const TOKEN = /\{\{([A-Z_]+)\}\}/g;

function resolveString(text, env, open) {
  return String(text).replace(TOKEN, (whole, key) => {
    const def = PLACEHOLDERS[key];
    if (!def) return whole; // unknown token: left visible so a typo is noticed in review
    const value = String(env[def.env] || "").trim();
    if (value) return value;
    open.set(key, def);
    return `[Owner to provide: ${def.label}]`;
  });
}

function resolveDeep(node, env, open) {
  if (typeof node === "string") return resolveString(node, env, open);
  if (Array.isArray(node)) return node.map((n) => resolveDeep(n, env, open));
  if (node && typeof node === "object") {
    const out = {};
    for (const [k, v] of Object.entries(node)) out[k] = resolveDeep(v, env, open);
    return out;
  }
  return node;
}

// Returns the content with every placeholder filled or visibly marked, plus the list of what is still missing.
function resolveContent(content, env = {}) {
  const open = new Map();
  const resolved = resolveDeep(content, env, open);
  const openItems = [...open.entries()].map(([key, def]) => ({ key, env: def.env, label: def.label }));
  return { content: resolved, openItems, complete: openItems.length === 0 };
}

const SOURCES = ["web", "mobile"];
const normalizeSource = (raw) => (SOURCES.includes(String(raw || "").toLowerCase()) ? String(raw).toLowerCase() : "unknown");

// A notice can be called "reviewed" only when the owner says so; anything else is a draft.
const reviewStatus = (env = {}) => (String(env.LEGAL_REVIEW_STATUS || "").toLowerCase() === "reviewed" ? "reviewed" : "draft");

module.exports = { PLACEHOLDERS, resolveContent, normalizeSource, reviewStatus };
