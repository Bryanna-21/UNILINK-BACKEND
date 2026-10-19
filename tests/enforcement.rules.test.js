"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const E = require("../src/utils/enforcement.rules");

const NOW = new Date("2026-10-19T12:00:00Z");
const days = (n) => new Date(NOW.getTime() + n * 86400 * 1000);
const U1 = "uni000000000000000000a1", U2 = "uni000000000000000000b2";
const admin = { id: "a1", role: "admin", universityId: U1 };
const admin2 = { id: "a2", role: "admin", universityId: U1 };
const platformAdmin = { id: "a3", role: "admin", universityId: null };
const boss = { id: "s1", role: "superadmin", universityId: null };
const boss2 = { id: "s2", role: "superadmin", universityId: null };

// ---------------------------------------------------------------- the ladder
test("first offence: P3 gets a warning, P2 may be muted, P1 may be suspended, P0 may go to the top", () => {
  const ok = (actionType, severity) => E.checkLadder({ actionType, severity, priorActions: [], now: NOW }).ok;
  assert.equal(ok("warning", "P3"), true);
  assert.equal(ok("feature_restriction", "P3"), false);
  assert.equal(ok("feature_restriction", "P2"), true);
  assert.equal(ok("temporary_suspension", "P2"), false);
  assert.equal(ok("temporary_suspension", "P1"), true);
  assert.equal(ok("permanent_termination", "P1"), false);
  assert.equal(ok("permanent_termination", "P0"), true);
});

test("content removal is never blocked by the ladder", () => {
  assert.equal(E.checkLadder({ actionType: "content_removal", severity: "P3", priorActions: [], now: NOW }).ok, true);
});

test("a record lets a case go one rung above it", () => {
  const prior = [{ actionType: "warning", status: "active", createdAt: days(-30) }];
  assert.equal(E.checkLadder({ actionType: "feature_restriction", severity: "P3", priorActions: prior, now: NOW }).ok, true);
  assert.equal(E.checkLadder({ actionType: "temporary_suspension", severity: "P3", priorActions: prior, now: NOW }).ok, false);
});

test("the refusal names the furthest rung that is allowed", () => {
  const r = E.checkLadder({ actionType: "temporary_suspension", severity: "P3", priorActions: [], now: NOW });
  assert.equal(r.reason, "skips_the_ladder");
  assert.equal(r.maxAction, "warning");
});

test("revoked, overturned and rejected actions, and old ones, do not count", () => {
  const old = { actionType: "temporary_suspension", status: "expired", createdAt: days(-400) };
  const revoked = { actionType: "temporary_suspension", status: "revoked", createdAt: days(-5) };
  const overturned = { actionType: "temporary_suspension", status: "overturned", createdAt: days(-5) };
  const rejected = { actionType: "permanent_termination", status: "rejected", createdAt: days(-5) };
  assert.equal(E.highestPriorRung([old, revoked, overturned, rejected], NOW), 0);
  assert.equal(E.highestPriorRung([{ actionType: "temporary_suspension", status: "expired", createdAt: days(-100) }], NOW), 3);
});

// ---------------------------------------------------------------- durations
test("mutes and suspensions need a whole number of days within the limit; others need none", () => {
  assert.deepEqual(E.validateDuration("temporary_suspension", 7), { ok: true, days: 7 });
  assert.deepEqual(E.validateDuration("feature_restriction", "30"), { ok: true, days: 30 });
  assert.equal(E.validateDuration("temporary_suspension", 0).ok, false);
  assert.equal(E.validateDuration("temporary_suspension", 91).ok, false);
  assert.equal(E.validateDuration("temporary_suspension", 2.5).ok, false);
  assert.equal(E.validateDuration("temporary_suspension", undefined).ok, false);
  assert.deepEqual(E.validateDuration("warning", undefined), { ok: true, days: null });
  assert.deepEqual(E.validateDuration("permanent_termination", 5), { ok: true, days: null });
});

// ---------------------------------------------------------------- who may act on whom
test("nobody acts on themselves, on a superadmin, or (unless superadmin) on an admin", () => {
  const student = { id: "u1", role: "student", universityId: U1 };
  assert.equal(E.canActOnUser({ actor: admin, target: student }).ok, true);
  assert.equal(E.canActOnUser({ actor: admin, target: { ...student, id: "a1" } }).reason, "cannot_act_on_self");
  assert.equal(E.canActOnUser({ actor: boss, target: { id: "s9", role: "superadmin" } }).reason, "cannot_act_on_superadmin");
  assert.equal(E.canActOnUser({ actor: admin, target: { id: "a9", role: "admin", universityId: U1 } }).reason, "only_superadmin_can_act_on_admin");
  assert.equal(E.canActOnUser({ actor: boss, target: { id: "a9", role: "admin", universityId: U1 } }).ok, true);
});

test("an admin tied to a university cannot act on another university; a platform admin can", () => {
  const elsewhere = { id: "u2", role: "student", universityId: U2 };
  assert.equal(E.canActOnUser({ actor: admin, target: elsewhere }).reason, "outside_your_university");
  assert.equal(E.canActOnUser({ actor: platformAdmin, target: elsewhere }).ok, true);
  assert.equal(E.canActOnUser({ actor: boss, target: elsewhere }).ok, true);
});

test("a moderator cannot decide a report they filed or one about them", () => {
  const base = { status: "open", universityId: U1, reporterId: "u5", reportedUserId: "u6" };
  assert.equal(E.canActOnReport({ actor: admin, report: base }).ok, true);
  assert.equal(E.canActOnReport({ actor: admin, report: { ...base, reporterId: "a1" } }).reason, "you_filed_this_report");
  assert.equal(E.canActOnReport({ actor: admin, report: { ...base, reportedUserId: "a1" } }).reason, "you_are_the_reported_user");
});

test("restricted and out-of-scope reports look like they do not exist; closed and escalated ones are refused", () => {
  const base = { status: "open", universityId: U1, reporterId: "u5", reportedUserId: "u6" };
  assert.equal(E.canActOnReport({ actor: admin, report: { ...base, restrictedToSuperadmin: true } }).reason, "report_not_found");
  assert.equal(E.canActOnReport({ actor: boss, report: { ...base, restrictedToSuperadmin: true } }).ok, true);
  assert.equal(E.canActOnReport({ actor: admin, report: { ...base, universityId: U2 } }).reason, "report_not_found");
  assert.equal(E.canActOnReport({ actor: admin, report: { ...base, status: "resolved" } }).reason, "report_closed");
  assert.equal(E.canActOnReport({ actor: admin, report: { ...base, status: "escalated" } }).reason, "escalated_to_superadmin");
  assert.equal(E.canActOnReport({ actor: boss, report: { ...base, status: "escalated" } }).ok, true);
});

// ---------------------------------------------------------------- termination needs two
test("an admin may propose closing an account only in a severe case; a superadmin in any", () => {
  assert.equal(E.canProposeTermination({ role: "admin", severity: "P1" }).ok, true);
  assert.equal(E.canProposeTermination({ role: "admin", severity: "P2" }).ok, false);
  assert.equal(E.canProposeTermination({ role: "superadmin", severity: "P3" }).ok, true);
  assert.equal(E.canProposeTermination({ role: "student", severity: "P0" }).ok, false);
});

const pending = (extra = {}) => ({ actionType: "permanent_termination", status: "pending_approval", moderatorId: "a1", userId: "u1", pendingExpiresAt: days(5), ...extra });

test("the approver must be a different moderator", () => {
  const target = { id: "u1", universityId: U1 };
  assert.equal(E.canApproveTermination({ approver: admin, action: pending(), target, now: NOW }).reason, "approver_must_differ_from_proposer");
  assert.equal(E.canApproveTermination({ approver: admin2, action: pending(), target, now: NOW }).ok, true);
  assert.equal(E.canApproveTermination({ approver: boss, action: pending(), target, now: NOW }).ok, true);
});

test("a proposal that is not pending, has expired, or is not a termination cannot be approved", () => {
  const target = { id: "u1", universityId: U1 };
  assert.equal(E.canApproveTermination({ approver: admin2, action: pending({ status: "active" }), target, now: NOW }).reason, "not_awaiting_approval");
  assert.equal(E.canApproveTermination({ approver: admin2, action: pending({ pendingExpiresAt: days(-1) }), target, now: NOW }).reason, "approval_expired");
  assert.equal(E.canApproveTermination({ approver: admin2, action: pending({ actionType: "temporary_suspension" }), target, now: NOW }).reason, "not_a_termination");
});

test("restricted cases need a superadmin approver; an admin from another university cannot approve", () => {
  const target = { id: "u1", universityId: U1 };
  assert.equal(E.canApproveTermination({ approver: admin2, action: pending({ moderatorId: "s1" }), target, restricted: true, now: NOW }).reason, "restricted_to_superadmin");
  assert.equal(E.canApproveTermination({ approver: boss2, action: pending({ moderatorId: "s1" }), target, restricted: true, now: NOW }).ok, true);
  const other = { id: "a7", role: "admin", universityId: U2 };
  assert.equal(E.canApproveTermination({ approver: other, action: pending(), target, now: NOW }).reason, "outside_your_university");
});

// ---------------------------------------------------------------- appeals
test("only a final, unlifted decision inside the window, not yet appealed, can be appealed", () => {
  const act = (extra = {}) => ({ actionType: "temporary_suspension", status: "active", createdAt: days(-3), ...extra });
  assert.equal(E.appealable({ action: act(), existingAppeal: null, now: NOW }).ok, true);
  assert.equal(E.appealable({ action: act({ status: "expired" }), existingAppeal: null, now: NOW }).ok, true); // clearing the record still matters
  assert.equal(E.appealable({ action: act({ status: "pending_approval" }), now: NOW }).reason, "not_final");
  assert.equal(E.appealable({ action: act({ status: "rejected" }), now: NOW }).reason, "not_final");
  assert.equal(E.appealable({ action: act({ status: "revoked" }), now: NOW }).reason, "already_lifted");
  assert.equal(E.appealable({ action: act({ status: "overturned" }), now: NOW }).reason, "already_overturned");
  assert.equal(E.appealable({ action: act(), existingAppeal: { _id: "x" }, now: NOW }).reason, "already_appealed");
  assert.equal(E.appealable({ action: act({ createdAt: days(-31) }), now: NOW }).reason, "appeal_window_closed");
  assert.equal(E.appealable({ action: null, now: NOW }).reason, "action_not_found");
});

test("an appeal is decided by someone who took no part in the decision and is not the person appealing", () => {
  const action = { actionType: "temporary_suspension", moderatorId: "a1", approvedBy: null };
  const appeal = { userId: "u1", universityId: U1 };
  assert.equal(E.canDecideAppeal({ reviewer: admin, action, appeal }).reason, "reviewer_must_be_independent");
  assert.equal(E.canDecideAppeal({ reviewer: admin2, action, appeal }).ok, true);
  assert.equal(E.canDecideAppeal({ reviewer: { id: "u1", role: "admin", universityId: U1 }, action, appeal }).reason, "cannot_review_own_appeal");
  assert.equal(E.canDecideAppeal({ reviewer: { id: "x", role: "student" }, action, appeal }).reason, "not_a_platform_moderator");
});

test("the approver of a termination cannot decide its appeal either", () => {
  const action = { actionType: "permanent_termination", moderatorId: "a1", approvedBy: "s1" };
  const appeal = { userId: "u1", universityId: U1 };
  assert.equal(E.canDecideAppeal({ reviewer: boss, action, appeal }).reason, "reviewer_must_be_independent");
  assert.equal(E.canDecideAppeal({ reviewer: boss2, action, appeal }).ok, true);
});

test("a termination appeal, and a restricted case, need a superadmin", () => {
  const term = { actionType: "permanent_termination", moderatorId: "a1", approvedBy: "s1" };
  const appeal = { userId: "u1", universityId: U1 };
  assert.equal(E.canDecideAppeal({ reviewer: admin2, action: term, appeal }).reason, "superadmin_required");
  const reduced = { actionType: "temporary_suspension", reducedFrom: "permanent_termination", moderatorId: "a1" };
  assert.equal(E.canDecideAppeal({ reviewer: admin2, action: reduced, appeal }).reason, "superadmin_required");
  const plain = { actionType: "warning", moderatorId: "a1" };
  assert.equal(E.canDecideAppeal({ reviewer: admin2, action: plain, appeal, restricted: true }).reason, "superadmin_required");
});

test("an admin cannot decide an appeal from another university", () => {
  const action = { actionType: "warning", moderatorId: "a1" };
  assert.equal(E.canDecideAppeal({ reviewer: { id: "a8", role: "admin", universityId: U2 }, action, appeal: { userId: "u1", universityId: U1 } }).reason, "outside_your_university");
});

test("appeal decisions: reduce must be shorter than the original and within the limit", () => {
  const susp = { actionType: "temporary_suspension", startsAt: NOW, expiresAt: days(30) };
  assert.equal(E.validateAppealDecision({ action: susp, decision: "upheld" }).ok, true);
  assert.equal(E.validateAppealDecision({ action: susp, decision: "overturned" }).ok, true);
  assert.equal(E.validateAppealDecision({ action: susp, decision: "maybe" }).reason, "unknown_decision");
  assert.deepEqual(E.validateAppealDecision({ action: susp, decision: "reduced", reducedToDays: 10 }), { ok: true, days: 10 });
  assert.equal(E.validateAppealDecision({ action: susp, decision: "reduced", reducedToDays: 30 }).reason, "must_be_shorter");
  assert.equal(E.validateAppealDecision({ action: susp, decision: "reduced", reducedToDays: 0 }).reason, "duration_out_of_range");
  assert.equal(E.validateAppealDecision({ action: susp, decision: "reduced" }).reason, "duration_out_of_range");
  assert.equal(E.validateAppealDecision({ action: { actionType: "warning" }, decision: "reduced", reducedToDays: 3 }).reason, "cannot_reduce_this_action");
});

test("a termination can be reduced to any suspension length", () => {
  const term = { actionType: "permanent_termination", startsAt: NOW, expiresAt: null };
  assert.deepEqual(E.validateAppealDecision({ action: term, decision: "reduced", reducedToDays: 60 }), { ok: true, days: 60 });
});

// ---------------------------------------------------------------- what an action does to the account
test("userStateAfterLift: nothing else in force means active again", () => {
  const lifted = { _id: "A", actionType: "temporary_suspension", previousState: { status: "active", suspendedUntil: null } };
  assert.deepEqual(E.userStateAfterLift({ lifted, otherActions: [lifted], now: NOW }), { status: "active", suspendedUntil: null });
});

test("userStateAfterLift: another suspension still in force keeps the account suspended until it ends", () => {
  const lifted = { _id: "A", actionType: "temporary_suspension", previousState: { status: "active" } };
  const other = { _id: "B", actionType: "temporary_suspension", status: "active", expiresAt: days(10) };
  const s = E.userStateAfterLift({ lifted, otherActions: [lifted, other], now: NOW });
  assert.equal(s.status, "suspended");
  assert.equal(s.suspendedUntil.getTime(), days(10).getTime());
});

test("userStateAfterLift: an approved termination still in force wins", () => {
  const lifted = { _id: "A", actionType: "temporary_suspension" };
  const term = { _id: "T", actionType: "permanent_termination", status: "active" };
  assert.deepEqual(E.userStateAfterLift({ lifted, otherActions: [term], now: NOW }), { status: "terminated", suspendedUntil: null });
});

test("userStateAfterLift: a pending closure's hold counts until it lapses", () => {
  const lifted = { _id: "A", actionType: "temporary_suspension" };
  const pend = { _id: "P", actionType: "permanent_termination", status: "pending_approval", pendingExpiresAt: days(4) };
  const s = E.userStateAfterLift({ lifted, otherActions: [pend], now: NOW });
  assert.equal(s.status, "suspended");
  assert.equal(s.suspendedUntil.getTime(), days(4).getTime());
  const lapsed = { ...pend, pendingExpiresAt: days(-1) };
  assert.equal(E.userStateAfterLift({ lifted, otherActions: [lapsed], now: NOW }).status, "active");
});

test("userStateAfterLift: lifting a penalty restores a separate earlier manual suspension", () => {
  const lifted = { _id: "A", actionType: "temporary_suspension", previousState: { status: "suspended", suspendedUntil: days(20) } };
  const s = E.userStateAfterLift({ lifted, otherActions: [], now: NOW });
  assert.equal(s.status, "suspended");
  assert.equal(s.suspendedUntil.getTime(), days(20).getTime());
  const open = { _id: "A", actionType: "temporary_suspension", previousState: { status: "suspended", suspendedUntil: null } };
  assert.deepEqual(E.userStateAfterLift({ lifted: open, otherActions: [], now: NOW }), { status: "suspended", suspendedUntil: null });
  const gone = { _id: "A", actionType: "temporary_suspension", previousState: { status: "suspended", suspendedUntil: days(-2) } };
  assert.equal(E.userStateAfterLift({ lifted: gone, otherActions: [], now: NOW }).status, "active");
});

test("userUpdateForAction: what each action does to the account", () => {
  const mute = { _id: "M", actionType: "feature_restriction", feature: "messaging", expiresAt: days(7), reason: "r" };
  const u = E.userUpdateForAction({ action: mute, user: { status: "active" } });
  assert.deepEqual(u.$push.restrictions, { feature: "messaging", until: days(7), reason: "r", actionId: "M" });

  const susp = { _id: "S", actionType: "temporary_suspension", expiresAt: days(7) };
  assert.deepEqual(E.userUpdateForAction({ action: susp, user: { status: "active" } }).$set, { status: "suspended", suspendedUntil: days(7) });

  const term = { _id: "T", actionType: "permanent_termination", pendingExpiresAt: days(7) };
  assert.deepEqual(E.userUpdateForAction({ action: term, user: { status: "active" } }).$set, { status: "terminated", suspendedUntil: null });
  assert.deepEqual(E.userUpdateForAction({ action: term, user: { status: "active" }, holdOnly: true }).$set, { status: "suspended", suspendedUntil: days(7) });

  assert.equal(E.userUpdateForAction({ action: { actionType: "warning" }, user: {} }), null);
  assert.equal(E.userUpdateForAction({ action: { actionType: "content_removal" }, user: {} }), null);
});

test("userUpdateForAction never shortens a suspension the account already has", () => {
  const susp = { _id: "S", actionType: "temporary_suspension", expiresAt: days(7) };
  const longer = E.userUpdateForAction({ action: susp, user: { status: "suspended", suspendedUntil: days(40) } });
  assert.equal(longer.$set.suspendedUntil.getTime(), days(40).getTime());
  const indefinite = E.userUpdateForAction({ action: susp, user: { status: "suspended", suspendedUntil: null } });
  assert.equal(indefinite.$set.suspendedUntil, null);
});
