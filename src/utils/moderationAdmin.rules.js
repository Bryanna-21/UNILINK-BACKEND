"use strict";

// Rules for the admin moderation queue. Pure, so they can be tested without a database.
const R = require("./moderation.rules");
const { isUnassigned } = require("./adminScope");

// Which reports an actor may see. Reports flagged restrictedToSuperadmin are superadmin-only.
// An admin tied to a university sees only that university's reports; a platform admin and the
// superadmin see all of the rest.
function visibleFilter(actor) {
  const f = {};
  if (actor.role !== "superadmin") f.restrictedToSuperadmin = { $ne: true };
  if (!isUnassigned(actor)) f.universityId = String(actor.universityId);
  return f;
}

// ?status= accepts open (the default: open, in_review, escalated), closed (resolved, dismissed),
// one specific status, or all.
function statusFilter(param) {
  const p = typeof param === "string" ? param : "open";
  if (p === "all") return null;
  if (p === "open") return { $in: R.OPEN_STATUSES };
  if (p === "closed") return { $in: ["resolved", "dismissed"] };
  return R.REPORT_STATUSES.includes(p) ? p : { $in: R.OPEN_STATUSES };
}

// A confirmed violation is "resolved"; every other outcome closes the report as "dismissed".
const statusForOutcome = (outcome) => (outcome === "violation_confirmed" ? "resolved" : "dismissed");

// Escalated reports are for the superadmin to decide.
function canClose(actor, report) {
  if (!R.OPEN_STATUSES.includes(report.status)) return { ok: false, reason: "already_closed" };
  if (report.status === "escalated" && actor.role !== "superadmin") return { ok: false, reason: "escalated_to_superadmin" };
  return { ok: true };
}

module.exports = { visibleFilter, statusFilter, statusForOutcome, canClose };
