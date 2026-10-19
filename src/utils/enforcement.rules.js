"use strict";

// The penalties ladder: who may impose what, on whom, how far up the ladder, how long it lasts,
// who must approve a termination, and who may decide an appeal.
//
// Deliberately PURE (no database, no Express), like moderation.rules.js, so every rule is
// unit-tested without a database (tests/enforcement.rules.test.js).
//
//   content_removal  rung 0  not part of the ladder; always allowed
//   warning          rung 1
//   feature_restriction (mute)  rung 2
//   temporary_suspension        rung 3
//   permanent_termination       rung 4  ALWAYS needs a second moderator

const R = require("./moderation.rules");
const { isUnassigned } = require("./adminScope");

const RUNG = { content_removal: 0, warning: 1, feature_restriction: 2, temporary_suspension: 3, permanent_termination: 4 };
const HISTORY_MONTHS = 12; // old offences stop counting towards the ladder after this
const TERMINATION_APPROVAL_DAYS = 7; // a proposed termination lapses if nobody approves it
const DAY_MS = 86400 * 1000;
const COUNTS_ON_RECORD = ["active", "expired"]; // revoked, overturned and rejected actions never count
const DURATION_ACTIONS = ["feature_restriction", "temporary_suspension"];

const isSevere = (severity) => severity === "P0" || severity === "P1";
const addDays = (d, n) => new Date(new Date(d).getTime() + n * DAY_MS);

// ---------------------------------------------------------------- the ladder
function highestPriorRung(priorActions, now = new Date()) {
  const cutoff = new Date(now).getTime() - HISTORY_MONTHS * 30 * DAY_MS;
  let top = 0;
  for (const a of priorActions || []) {
    if (!COUNTS_ON_RECORD.includes(a.status)) continue;
    if (new Date(a.createdAt).getTime() < cutoff) continue;
    top = Math.max(top, RUNG[a.actionType] || 0);
  }
  return top;
}

// How far up the ladder a case of this severity may go. A first offence of an ordinary case
// (P3) gets a warning; a significant one (P2) may be muted at once; a severe one (P1) may be
// suspended at once; a critical one (P0, e.g. child safety) may go to the top. After that a case
// may always go ONE rung above the person's record.
function maxRungFor(severity, priorRung) {
  const floor = severity === "P0" ? 4 : severity === "P1" ? 3 : severity === "P2" ? 2 : 1;
  return Math.max(floor, priorRung + 1);
}

function checkLadder({ actionType, severity, priorActions, now = new Date() }) {
  if (!(actionType in RUNG)) return { ok: false, reason: "unknown_action" };
  if (actionType === "content_removal") return { ok: true };
  const prior = highestPriorRung(priorActions, now);
  const max = maxRungFor(severity, prior);
  if (RUNG[actionType] <= max) return { ok: true };
  const allowed = Object.keys(RUNG).find((k) => RUNG[k] === max);
  return { ok: false, reason: "skips_the_ladder", maxAction: allowed, priorRung: prior };
}

// ---------------------------------------------------------------- durations
// Returns { ok, days } for the actions that last a set time, { ok, days: null } for the others.
function validateDuration(actionType, raw) {
  if (!DURATION_ACTIONS.includes(actionType)) return { ok: true, days: null };
  const days = typeof raw === "number" ? raw : /^\d+$/.test(String(raw ?? "").trim()) ? parseInt(raw, 10) : NaN;
  const max = actionType === "temporary_suspension" ? R.MAX_SUSPENSION_DAYS : R.MAX_RESTRICTION_DAYS;
  if (!Number.isInteger(days) || days < 1 || days > max) return { ok: false, reason: "duration_out_of_range", max };
  return { ok: true, days };
}

// ---------------------------------------------------------------- who may act on whom
function canActOnUser({ actor, target }) {
  if (!target) return { ok: false, reason: "user_not_found" };
  if (String(actor.id) === String(target.id)) return { ok: false, reason: "cannot_act_on_self" };
  if (target.role === "superadmin") return { ok: false, reason: "cannot_act_on_superadmin" };
  if (target.role === "admin" && actor.role !== "superadmin") return { ok: false, reason: "only_superadmin_can_act_on_admin" };
  if (!isUnassigned(actor) && String(target.universityId || "") !== String(actor.universityId)) {
    return { ok: false, reason: "outside_your_university" };
  }
  return { ok: true };
}

// Whether `actor` may impose a penalty because of this report. A moderator can never judge a
// report they filed themselves, and escalated or restricted reports stay with superadmins.
function canActOnReport({ actor, report }) {
  if (!report) return { ok: false, reason: "report_not_found" };
  if (report.restrictedToSuperadmin && actor.role !== "superadmin") return { ok: false, reason: "report_not_found" }; // do not reveal it exists
  if (!isUnassigned(actor) && String(report.universityId || "") !== String(actor.universityId)) return { ok: false, reason: "report_not_found" };
  if (String(report.reporterId) === String(actor.id)) return { ok: false, reason: "you_filed_this_report" };
  if (report.reportedUserId && String(report.reportedUserId) === String(actor.id)) return { ok: false, reason: "you_are_the_reported_user" };
  if (!R.OPEN_STATUSES.includes(report.status)) return { ok: false, reason: "report_closed" };
  if (report.status === "escalated" && actor.role !== "superadmin") return { ok: false, reason: "escalated_to_superadmin" };
  return { ok: true };
}

// ---------------------------------------------------------------- termination: two moderators
// Proposing follows the existing rule (an admin only for P0/P1; a superadmin for any case). The
// approver must be a DIFFERENT moderator who can also see the case.
function canProposeTermination({ role, severity }) {
  return R.canEnforce({ role, action: "permanent_termination", severity });
}

function canApproveTermination({ approver, action, target, restricted, now = new Date() }) {
  if (!approver || (approver.role !== "admin" && approver.role !== "superadmin")) return { ok: false, reason: "not_a_platform_moderator" };
  if (!action || action.actionType !== "permanent_termination") return { ok: false, reason: "not_a_termination" };
  if (action.status !== "pending_approval") return { ok: false, reason: "not_awaiting_approval" };
  if (action.pendingExpiresAt && new Date(action.pendingExpiresAt).getTime() <= new Date(now).getTime()) return { ok: false, reason: "approval_expired" };
  if (String(approver.id) === String(action.moderatorId)) return { ok: false, reason: "approver_must_differ_from_proposer" };
  if (String(approver.id) === String(action.userId)) return { ok: false, reason: "cannot_act_on_self" };
  if (restricted && approver.role !== "superadmin") return { ok: false, reason: "restricted_to_superadmin" };
  if (!isUnassigned(approver) && target && String(target.universityId || "") !== String(approver.universityId)) return { ok: false, reason: "outside_your_university" };
  return { ok: true };
}

// ---------------------------------------------------------------- appeals
// Only a decided action can be appealed: a proposed termination is not final, and a rejected
// one never happened.
function appealable({ action, existingAppeal, now = new Date() }) {
  if (action && (action.status === "pending_approval" || action.status === "rejected")) return { ok: false, reason: "not_final" };
  if (action && action.status === "revoked") return { ok: false, reason: "already_lifted" };
  return R.appealEligibility({ action, existingAppeal, now });
}

// Independent of everyone who decided the original action, never the person appealing, and
// kept inside the same boundaries as the case (restricted cases and terminations: superadmin).
function canDecideAppeal({ reviewer, action, appeal, restricted }) {
  if (!reviewer || (reviewer.role !== "admin" && reviewer.role !== "superadmin")) return { ok: false, reason: "not_a_platform_moderator" };
  const rid = String(reviewer.id);
  if (rid === String(appeal.userId)) return { ok: false, reason: "cannot_review_own_appeal" };
  if (rid === String(action.moderatorId) || (action.approvedBy && rid === String(action.approvedBy))) {
    return { ok: false, reason: "reviewer_must_be_independent" };
  }
  const wasTermination = action.actionType === "permanent_termination" || action.reducedFrom === "permanent_termination";
  if ((restricted || wasTermination) && reviewer.role !== "superadmin") return { ok: false, reason: "superadmin_required" };
  if (!isUnassigned(reviewer) && String(appeal.universityId || "") !== String(reviewer.universityId)) return { ok: false, reason: "outside_your_university" };
  return { ok: true };
}

function originalDays(action) {
  if (!action.expiresAt) return null;
  return Math.max(1, Math.ceil((new Date(action.expiresAt) - new Date(action.startsAt)) / DAY_MS));
}

const APPEAL_DECISIONS = ["upheld", "overturned", "reduced"];

// `reduced` shortens a suspension or mute, or turns a termination into a suspension.
function validateAppealDecision({ action, decision, reducedToDays }) {
  if (!APPEAL_DECISIONS.includes(decision)) return { ok: false, reason: "unknown_decision" };
  if (decision !== "reduced") return { ok: true, days: null };
  if (!["temporary_suspension", "feature_restriction", "permanent_termination"].includes(action.actionType)) {
    return { ok: false, reason: "cannot_reduce_this_action" };
  }
  const days = typeof reducedToDays === "number" ? reducedToDays : /^\d+$/.test(String(reducedToDays ?? "").trim()) ? parseInt(reducedToDays, 10) : NaN;
  if (!Number.isInteger(days) || days < 1 || days > R.MAX_SUSPENSION_DAYS) return { ok: false, reason: "duration_out_of_range", max: R.MAX_SUSPENSION_DAYS };
  const was = originalDays(action);
  if (action.actionType !== "permanent_termination" && was !== null && days >= was) return { ok: false, reason: "must_be_shorter", was };
  return { ok: true, days };
}

// ---------------------------------------------------------------- what an action does to the account
const effectiveEnd = (a) =>
  a.status === "pending_approval" ? (a.pendingExpiresAt ? new Date(a.pendingExpiresAt) : null)
  : a.actionType === "permanent_termination" ? Infinity
  : a.expiresAt ? new Date(a.expiresAt) : Infinity;

// The user's standing once `lifted` no longer applies: whatever other blocking action is still
// in force, else the state the account was in before it (so lifting a penalty never wipes out a
// separate manual suspension), else active.
function userStateAfterLift({ lifted, otherActions, now = new Date() }) {
  const t = new Date(now).getTime();
  const live = (otherActions || []).filter((a) => {
    if (String(a._id) === String(lifted._id)) return false;
    if (!["temporary_suspension", "permanent_termination"].includes(a.actionType)) return false;
    if (a.status !== "active" && a.status !== "pending_approval") return false;
    const end = effectiveEnd(a);
    return end === Infinity || (end && end.getTime() > t);
  });
  if (live.some((a) => a.status === "active" && a.actionType === "permanent_termination")) return { status: "terminated", suspendedUntil: null };
  if (live.length) {
    const ends = live.map(effectiveEnd);
    if (ends.includes(Infinity)) return { status: "suspended", suspendedUntil: null };
    return { status: "suspended", suspendedUntil: new Date(Math.max(...ends.map((d) => d.getTime()))) };
  }
  const prev = lifted.previousState;
  if (prev && prev.status === "terminated") return { status: "terminated", suspendedUntil: null };
  if (prev && prev.status === "suspended" && (!prev.suspendedUntil || new Date(prev.suspendedUntil).getTime() > t)) {
    return { status: "suspended", suspendedUntil: prev.suspendedUntil ? new Date(prev.suspendedUntil) : null };
  }
  return { status: "active", suspendedUntil: null };
}

// The MongoDB update an imposed action applies to the user. `user` is the account as it is now.
function userUpdateForAction({ action, user, holdOnly = false }) {
  if (action.actionType === "feature_restriction") {
    return { $push: { restrictions: { feature: action.feature, until: action.expiresAt || null, reason: action.reason, actionId: String(action._id) } } };
  }
  if (action.actionType === "temporary_suspension" || (action.actionType === "permanent_termination" && holdOnly)) {
    const until = action.actionType === "temporary_suspension" ? action.expiresAt : action.pendingExpiresAt;
    // Never shorten a block the account already has.
    if (user && user.status === "suspended" && !user.suspendedUntil) return { $set: { status: "suspended", suspendedUntil: null } };
    const cur = user && user.status === "suspended" && user.suspendedUntil ? new Date(user.suspendedUntil) : null;
    const next = cur && cur.getTime() > new Date(until).getTime() ? cur : new Date(until);
    return { $set: { status: "suspended", suspendedUntil: next } };
  }
  if (action.actionType === "permanent_termination") return { $set: { status: "terminated", suspendedUntil: null } };
  return null; // warning, content_removal: nothing changes on the account
}

module.exports = {
  RUNG, HISTORY_MONTHS, TERMINATION_APPROVAL_DAYS, DURATION_ACTIONS, APPEAL_DECISIONS,
  isSevere, addDays, highestPriorRung, maxRungFor, checkLadder, validateDuration,
  canActOnUser, canActOnReport, canProposeTermination, canApproveTermination,
  appealable, canDecideAppeal, originalDays, validateAppealDecision,
  userStateAfterLift, userUpdateForAction,
};
