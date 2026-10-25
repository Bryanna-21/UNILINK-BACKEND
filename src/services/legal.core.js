"use strict";

// Decisions about the Privacy Notice: what text is current, whether a person has acknowledged it, and recording that.
// No mongoose here: every database call goes through `repo`, so this runs under `npm test` against an in-memory repo.

const notice = require("../content/privacyNotice");
const { resolveContent, normalizeSource, reviewStatus } = require("../utils/legalContent.rules");

const ok = (data) => ({ ok: true, data });
const fail = (status, message, code) => ({ ok: false, status, message, code });

function createLegalCore({ repo, env = process.env, content = notice }) {
  async function liveUser(userId) {
    const u = await repo.userById(userId);
    return u && !u.deletedAt ? u : null;
  }

  // Public: the text anyone may read, with the owner's details filled in (or visibly missing).
  function getPrivacyNotice() {
    const { content: text, openItems, complete } = resolveContent(content, env);
    return ok({
      type: "privacy",
      version: content.version,
      effectiveDate: content.effectiveDate,
      reviewStatus: reviewStatus(env),
      complete,
      openItems: openItems.map((i) => i.label),
      notice: text,
    });
  }

  async function status(userId) {
    if (!(await liveUser(userId))) return fail(401, "Account not available.");
    const last = await repo.latestAcknowledgement(userId, "privacy");
    return ok({
      policyType: "privacy",
      currentVersion: content.version,
      acknowledgedVersion: last ? last.version : null,
      acknowledgedAt: last ? last.createdAt : null,
      needsAcknowledgement: !last || last.version !== content.version,
    });
  }

  // Records that this person acknowledged THIS version. A stale version is refused so nobody can "acknowledge" text
  // they were never shown; repeating a version already acknowledged adds nothing (no duplicate rows).
  async function acknowledge(userId, { policyType, version, source } = {}) {
    if (!(await liveUser(userId))) return fail(401, "Account not available.");
    if (policyType !== "privacy") return fail(400, "Unknown notice.", "UNKNOWN_POLICY");
    if (typeof version !== "string" || version !== content.version) {
      return fail(409, "The Privacy Notice has been updated. Please reload and read the latest version.", "NOTICE_OUT_OF_DATE");
    }
    const last = await repo.latestAcknowledgement(userId, "privacy");
    if (last && last.version === content.version) {
      return ok({ acknowledgedVersion: last.version, acknowledgedAt: last.createdAt, recorded: false });
    }
    const row = await repo.createAcknowledgement({ userId, policyType: "privacy", version: content.version, source: normalizeSource(source) });
    return ok({ acknowledgedVersion: row.version, acknowledgedAt: row.createdAt, recorded: true });
  }

  return { getPrivacyNotice, status, acknowledge };
}

module.exports = { createLegalCore };
