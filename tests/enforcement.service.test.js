"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createEnforcementService } = require("../src/services/enforcement.service");
const { createModerationService } = require("../src/services/moderation.service");
const { Coll, oid } = require("./enforcement.fakeDb");

const T0 = new Date("2026-10-19T12:00:00Z");
const day = 86400 * 1000;
const U1 = "uni000000000000000000a1", U2 = "uni000000000000000000b2";

const OFFENDER = oid(1), REPORTER = oid(2), OTHER_UNI = oid(3);
const A1 = oid(11), A2 = oid(12), ADMIN_TARGET = oid(13), A_OTHER_UNI = oid(19);
const S1 = oid(21), S2 = oid(22);

const actorOf = (id, role, universityId = null) => ({ id, role, universityId, email: `${id}@x.test` });
const admin1 = actorOf(A1, "admin", U1), admin2 = actorOf(A2, "admin", U1), adminU2 = actorOf(A_OTHER_UNI, "admin", U2);
const boss1 = actorOf(S1, "superadmin"), boss2 = actorOf(S2, "superadmin");

function world({ removerFails = false } = {}) {
  const clock = { t: new Date(T0) };
  const calls = { user: [], moderators: [], removed: [] };
  const db = {
    User: new Coll([
      { _id: OFFENDER, role: "student", universityId: U1, status: "active", suspendedUntil: null, restrictions: [], name: "Offender" },
      { _id: REPORTER, role: "student", universityId: U1, status: "active", name: "Reporter" },
      { _id: OTHER_UNI, role: "student", universityId: U2, status: "active", name: "Elsewhere" },
      { _id: A1, role: "admin", universityId: U1, status: "active", name: "Admin One" },
      { _id: A2, role: "admin", universityId: U1, status: "active", name: "Admin Two" },
      { _id: ADMIN_TARGET, role: "admin", universityId: U1, status: "active", name: "Reported Admin" },
      { _id: A_OTHER_UNI, role: "admin", universityId: U2, status: "active", name: "Admin Elsewhere" },
      { _id: S1, role: "superadmin", universityId: null, status: "active", name: "Boss One" },
      { _id: S2, role: "superadmin", universityId: null, status: "active", name: "Boss Two" },
    ]),
    ContentReport: new Coll(),
    ModerationAction: new Coll(),
    Appeal: new Coll([], { unique: ["actionId"] }),
    AuditLog: new Coll(),
  };
  const notifier = {
    user: async (i) => calls.user.push(i),
    moderators: async (i) => calls.moderators.push(i),
  };
  const contentRemover = {
    canRemove: (t) => ["post", "comment"].includes(t),
    remove: async (x) => { if (removerFails) throw new Error("db down"); calls.removed.push(x); },
  };
  const svc = createEnforcementService({ models: db, notifier, contentRemover, now: () => clock.t });
  let n = 0;
  async function report(extra = {}) {
    n += 1;
    return db.ContentReport.create({
      reference: `RPT-${n}`, reporterId: REPORTER, entityType: "post", entityId: oid(500 + n), reportedUserId: OFFENDER, universityId: U1,
      category: "harassment", severity: "P2", status: "open", restrictedToSuperadmin: false, assignedTo: null,
      evidence: { snapshot: { content: "bad words" }, capturedAt: T0 }, resolution: { actionIds: [] }, events: [], ...extra,
    });
  }
  const flush = () => new Promise((r) => setImmediate(r));
  const advance = (ms) => { clock.t = new Date(clock.t.getTime() + ms); };
  return { db, svc, report, calls, flush, advance, clock };
}
const reject = async (p, status, code) => {
  await assert.rejects(p, (e) => { assert.equal(e.status, status, `expected ${status}, got ${e.status}: ${e.message}`); if (code) assert.equal(e.code, code); return true; });
};

// ---------------------------------------------------------------- imposing
test("a first offence of an ordinary case gets a warning; skipping the ladder is refused", async () => {
  const w = world();
  const r = await w.report({ severity: "P3", category: "spam" });
  await reject(w.svc.imposeAction({ actor: admin1, reportId: r._id, body: { actionType: "temporary_suspension", durationDays: 7, reason: "spam" } }), 409, "SKIPS_THE_LADDER");
  const ok = await w.svc.imposeAction({ actor: admin1, reportId: r._id, body: { actionType: "warning", reason: "Please stop posting links." } });
  assert.equal(ok.status, "active");
  const saved = w.db.ModerationAction.get(ok.id);
  assert.equal(saved.userId, OFFENDER);
  assert.equal(saved.policySection, "spam-abuse"); // defaulted from the report's category
  assert.equal(saved.moderatorId, A1);
  assert.equal(w.db.User.get(OFFENDER).status, "active"); // a warning changes nothing on the account
});

test("the reason is required, the policy section must be real, and the evidence is copied", async () => {
  const w = world();
  const r = await w.report({ severity: "P3", category: "spam" });
  await reject(w.svc.imposeAction({ actor: admin1, reportId: r._id, body: { actionType: "warning", reason: "   " } }), 400);
  await reject(w.svc.imposeAction({ actor: admin1, reportId: r._id, body: { actionType: "warning", reason: "x", policySection: "made-up" } }), 400, "POLICY_SECTION_REQUIRED");
  await reject(w.svc.imposeAction({ actor: admin1, reportId: r._id, body: { actionType: "fine", reason: "x" } }), 400);
  const ok = await w.svc.imposeAction({ actor: admin1, reportId: r._id, body: { actionType: "warning", reason: "x" } });
  assert.deepEqual(w.db.ModerationAction.get(ok.id).evidence.snapshot, { content: "bad words" });
});

test("a mute restricts one feature on the account and lasts the number of days chosen", async () => {
  const w = world();
  const r = await w.report({ severity: "P2" });
  await reject(w.svc.imposeAction({ actor: admin1, reportId: r._id, body: { actionType: "feature_restriction", reason: "x" } }), 400, "FEATURE_REQUIRED");
  await reject(w.svc.imposeAction({ actor: admin1, reportId: r._id, body: { actionType: "feature_restriction", feature: "messaging", reason: "x" } }), 400, "DURATION_OUT_OF_RANGE");
  const ok = await w.svc.imposeAction({ actor: admin1, reportId: r._id, body: { actionType: "feature_restriction", feature: "messaging", durationDays: 7, reason: "Harassing messages." } });
  const user = w.db.User.get(OFFENDER);
  assert.equal(user.restrictions.length, 1);
  assert.equal(user.restrictions[0].feature, "messaging");
  assert.equal(user.restrictions[0].actionId, ok.id);
  assert.equal(new Date(user.restrictions[0].until).getTime(), T0.getTime() + 7 * day);
});

test("a suspension suspends the account until the date, remembers the previous state, and tells the person", async () => {
  const w = world();
  const r = await w.report({ severity: "P0", category: "threats_violence" });
  const ok = await w.svc.imposeAction({ actor: admin1, reportId: r._id, body: { actionType: "temporary_suspension", durationDays: 14, reason: "Threats." } });
  await w.flush();
  const user = w.db.User.get(OFFENDER);
  assert.equal(user.status, "suspended");
  assert.equal(new Date(user.suspendedUntil).getTime(), T0.getTime() + 14 * day);
  assert.deepEqual(w.db.ModerationAction.get(ok.id).previousState, { status: "active", suspendedUntil: null });
  assert.deepEqual(w.calls.user, [{ userId: OFFENDER, kind: "imposed", actionType: "temporary_suspension" }]);
});

test("imposing logs the report event, the report's action list and an audit entry, and starts review", async () => {
  const w = world();
  const r = await w.report({ severity: "P2" });
  const ok = await w.svc.imposeAction({ actor: admin1, reportId: r._id, body: { actionType: "warning", reason: "x" } });
  const rep = w.db.ContentReport.get(r._id);
  assert.deepEqual(rep.resolution.actionIds, [ok.id]);
  assert.equal(rep.status, "in_review");
  assert.equal(rep.assignedTo, A1);
  assert.ok(rep.events.some((e) => e.type === "action_imposed" && e.actorId === A1));
  assert.equal(w.db.AuditLog.docs.length, 1);
  assert.equal(w.db.AuditLog.docs[0].action, "MODERATION_ACTION_IMPOSE");
});

test("who may act: not your own report, not yourself, not an admin (unless superadmin), not another university", async () => {
  const w = world();
  const mine = await w.report({ reporterId: A1 });
  await reject(w.svc.imposeAction({ actor: admin1, reportId: mine._id, body: { actionType: "warning", reason: "x" } }), 403, "YOU_FILED_THIS_REPORT");
  const self = await w.report({ reportedUserId: A1 });
  await reject(w.svc.imposeAction({ actor: admin1, reportId: self._id, body: { actionType: "warning", reason: "x" } }), 403, "YOU_ARE_THE_REPORTED_USER");
  const aboutAdmin = await w.report({ reportedUserId: ADMIN_TARGET });
  await reject(w.svc.imposeAction({ actor: admin1, reportId: aboutAdmin._id, body: { actionType: "warning", reason: "x" } }), 403, "ONLY_SUPERADMIN_CAN_ACT_ON_ADMIN");
  const ok = await w.svc.imposeAction({ actor: boss1, reportId: aboutAdmin._id, body: { actionType: "warning", reason: "x" } });
  assert.equal(ok.status, "active");
  const elsewhere = await w.report({ universityId: U2, reportedUserId: OTHER_UNI });
  await reject(w.svc.imposeAction({ actor: admin1, reportId: elsewhere._id, body: { actionType: "warning", reason: "x" } }), 404);
  await reject(w.svc.imposeAction({ actor: admin1, reportId: oid(777), body: { actionType: "warning", reason: "x" } }), 404);
});

test("a restricted report is invisible to admins; closed reports refuse penalties", async () => {
  const w = world();
  const secret = await w.report({ restrictedToSuperadmin: true, category: "child_safety", severity: "P0" });
  await reject(w.svc.imposeAction({ actor: admin1, reportId: secret._id, body: { actionType: "warning", reason: "x" } }), 404);
  const done = await w.report({ status: "resolved" });
  await reject(w.svc.imposeAction({ actor: admin1, reportId: done._id, body: { actionType: "warning", reason: "x" } }), 409, "REPORT_CLOSED");
});

test("a report that is not about an account cannot be penalised", async () => {
  const w = world();
  const r = await w.report({ reportedUserId: null });
  await reject(w.svc.imposeAction({ actor: admin1, reportId: r._id, body: { actionType: "warning", reason: "x" } }), 400);
});

test("a person's record lets the next case go one rung higher", async () => {
  const w = world();
  const r1 = await w.report({ severity: "P3", category: "spam" });
  await w.svc.imposeAction({ actor: admin1, reportId: r1._id, body: { actionType: "warning", reason: "x" } });
  const r2 = await w.report({ severity: "P3", category: "spam" });
  const ok = await w.svc.imposeAction({ actor: admin1, reportId: r2._id, body: { actionType: "feature_restriction", feature: "posting", durationDays: 3, reason: "again" } });
  assert.equal(ok.status, "active");
  const r3 = await w.report({ severity: "P3", category: "spam" });
  const up = await w.svc.imposeAction({ actor: admin1, reportId: r3._id, body: { actionType: "temporary_suspension", durationDays: 3, reason: "x" } });
  assert.equal(up.status, "active"); // one rung above a mute is a suspension
  const r4 = await w.report({ severity: "P3", category: "spam" });
  const closing = await w.svc.imposeAction({ actor: boss1, reportId: r4._id, body: { actionType: "permanent_termination", reason: "x" } });
  assert.equal(closing.status, "pending_approval"); // after a suspension, a closure is the next rung (and still needs a second moderator)
});

// ---------------------------------------------------------------- content removal
test("content removal deletes through the remover and is recorded; unsupported types are refused", async () => {
  const w = world();
  const r = await w.report({ entityType: "post", entityId: oid(900) });
  const ok = await w.svc.imposeAction({ actor: admin1, reportId: r._id, body: { actionType: "content_removal", reason: "Removed." } });
  assert.equal(ok.status, "active");
  assert.deepEqual(w.calls.removed, [{ entityType: "post", entityId: oid(900), mediaRef: null }]);
  const profile = await w.report({ entityType: "profile", entityId: OFFENDER });
  await reject(w.svc.imposeAction({ actor: admin1, reportId: profile._id, body: { actionType: "content_removal", reason: "x" } }), 400, "NOT_REMOVABLE");
});

test("if removing the content fails, nothing is recorded", async () => {
  const w = world({ removerFails: true });
  const r = await w.report({ entityType: "post" });
  await assert.rejects(w.svc.imposeAction({ actor: admin1, reportId: r._id, body: { actionType: "content_removal", reason: "x" } }));
  assert.equal(w.db.ModerationAction.docs.length, 0);
});

// ---------------------------------------------------------------- terminations
test("an admin cannot propose closing an account in an ordinary case", async () => {
  const w = world();
  const r = await w.report({ severity: "P2" });
  await reject(w.svc.imposeAction({ actor: admin1, reportId: r._id, body: { actionType: "permanent_termination", reason: "x" } }), 403);
});

test("a critical case: proposing a closure freezes the account and waits for a second moderator", async () => {
  const w = world();
  const r = await w.report({ severity: "P0", category: "threats_violence" });
  const p = await w.svc.imposeAction({ actor: admin1, reportId: r._id, body: { actionType: "permanent_termination", reason: "Credible threats." } });
  await w.flush();
  assert.equal(p.status, "pending_approval");
  assert.equal(p.accountHeld, true);
  const user = w.db.User.get(OFFENDER);
  assert.equal(user.status, "suspended"); // held, not closed
  assert.equal(new Date(user.suspendedUntil).getTime(), T0.getTime() + 7 * day); // the hold ends by itself if nobody approves
  assert.deepEqual(w.calls.user[0], { userId: OFFENDER, kind: "held", actionType: "permanent_termination" });
  const note = w.calls.moderators[0];
  assert.equal(note.kind, "termination_pending");
  assert.deepEqual(note.excludeIds, [A1]);
});

test("a superadmin's closure of an ordinary case waits for approval but does not freeze the account", async () => {
  const w = world();
  await w.db.ModerationAction.create({ userId: OFFENDER, actionType: "temporary_suspension", status: "expired", moderatorId: A1, createdAt: new Date(T0.getTime() - 30 * day), startsAt: new Date(T0.getTime() - 30 * day), expiresAt: new Date(T0.getTime() - 23 * day) });
  const r = await w.report({ severity: "P3", category: "spam" });
  const p = await w.svc.imposeAction({ actor: boss1, reportId: r._id, body: { actionType: "permanent_termination", reason: "Repeated fraud." } });
  assert.equal(p.status, "pending_approval");
  assert.equal(p.accountHeld, false);
  assert.equal(w.db.User.get(OFFENDER).status, "active");
});

test("two closures for the same person cannot be pending at once", async () => {
  const w = world();
  const r = await w.report({ severity: "P0", category: "threats_violence" });
  await w.svc.imposeAction({ actor: admin1, reportId: r._id, body: { actionType: "permanent_termination", reason: "x" } });
  const r2 = await w.report({ severity: "P0", category: "threats_violence" });
  await reject(w.svc.imposeAction({ actor: boss1, reportId: r2._id, body: { actionType: "permanent_termination", reason: "x" } }), 409);
});

test("the proposer cannot approve their own closure; a different moderator can, and the account is closed", async () => {
  const w = world();
  const r = await w.report({ severity: "P0", category: "threats_violence" });
  const p = await w.svc.imposeAction({ actor: admin1, reportId: r._id, body: { actionType: "permanent_termination", reason: "x" } });
  await reject(w.svc.decideTermination({ actor: admin1, actionId: p.id, approve: true }), 403, "APPROVER_MUST_DIFFER_FROM_PROPOSER");
  const done = await w.svc.decideTermination({ actor: admin2, actionId: p.id, approve: true, note: "Agreed." });
  await w.flush();
  assert.equal(done.status, "active");
  const user = w.db.User.get(OFFENDER);
  assert.equal(user.status, "terminated");
  assert.equal(user.suspendedUntil, null);
  const action = w.db.ModerationAction.get(p.id);
  assert.equal(action.approvedBy, A2);
  assert.equal(action.status, "active");
  assert.ok(w.calls.user.some((c) => c.kind === "closed"));
  assert.ok(w.db.AuditLog.docs.some((a) => a.action === "MODERATION_TERMINATION_APPROVE"));
});

test("rejecting a closure needs a reason and restores the account", async () => {
  const w = world();
  const r = await w.report({ severity: "P0", category: "threats_violence" });
  const p = await w.svc.imposeAction({ actor: admin1, reportId: r._id, body: { actionType: "permanent_termination", reason: "x" } });
  await reject(w.svc.decideTermination({ actor: admin2, actionId: p.id, approve: false }), 400);
  await w.svc.decideTermination({ actor: admin2, actionId: p.id, approve: false, note: "Not enough evidence." });
  await w.flush();
  const user = w.db.User.get(OFFENDER);
  assert.equal(user.status, "active");
  assert.equal(user.suspendedUntil, null);
  assert.equal(w.db.ModerationAction.get(p.id).status, "rejected");
  assert.ok(w.calls.user.some((c) => c.kind === "restored"));
});

test("a closure cannot be approved after its week is up, or twice", async () => {
  const w = world();
  const r = await w.report({ severity: "P0", category: "threats_violence" });
  const p = await w.svc.imposeAction({ actor: admin1, reportId: r._id, body: { actionType: "permanent_termination", reason: "x" } });
  w.advance(8 * day);
  await reject(w.svc.decideTermination({ actor: admin2, actionId: p.id, approve: true }), 409, "APPROVAL_EXPIRED");
  const w2 = world();
  const r2 = await w2.report({ severity: "P0", category: "threats_violence" });
  const p2 = await w2.svc.imposeAction({ actor: admin1, reportId: r2._id, body: { actionType: "permanent_termination", reason: "x" } });
  await w2.svc.decideTermination({ actor: admin2, actionId: p2.id, approve: true });
  await reject(w2.svc.decideTermination({ actor: boss1, actionId: p2.id, approve: true }), 409);
});

test("a restricted closure needs a second SUPERADMIN, and another university's admin cannot approve", async () => {
  const w = world();
  const secret = await w.report({ restrictedToSuperadmin: true, severity: "P0", category: "child_safety" });
  const p = await w.svc.imposeAction({ actor: boss1, reportId: secret._id, body: { actionType: "permanent_termination", reason: "x" } });
  await reject(w.svc.decideTermination({ actor: admin2, actionId: p.id, approve: true }), 404);
  await reject(w.svc.decideTermination({ actor: boss1, actionId: p.id, approve: true }), 403);
  const done = await w.svc.decideTermination({ actor: boss2, actionId: p.id, approve: true });
  assert.equal(done.status, "active");
  const w2 = world();
  const r = await w2.report({ severity: "P0", category: "threats_violence" });
  const p2 = await w2.svc.imposeAction({ actor: admin1, reportId: r._id, body: { actionType: "permanent_termination", reason: "x" } });
  await reject(w2.svc.decideTermination({ actor: adminU2, actionId: p2.id, approve: true }), 403, "OUTSIDE_YOUR_UNIVERSITY");
});

// ---------------------------------------------------------------- revoking
test("lifting a suspension early makes the account active again", async () => {
  const w = world();
  const r = await w.report({ severity: "P0", category: "threats_violence" });
  const s = await w.svc.imposeAction({ actor: admin1, reportId: r._id, body: { actionType: "temporary_suspension", durationDays: 30, reason: "x" } });
  await reject(w.svc.revokeAction({ actor: admin2, actionId: s.id, reason: "  " }), 400);
  await w.svc.revokeAction({ actor: admin2, actionId: s.id, reason: "Resolved with the student." });
  await w.flush();
  const user = w.db.User.get(OFFENDER);
  assert.equal(user.status, "active");
  assert.equal(user.suspendedUntil, null);
  assert.equal(w.db.ModerationAction.get(s.id).status, "revoked");
  assert.ok(w.calls.user.some((c) => c.kind === "lifted"));
  await reject(w.svc.revokeAction({ actor: admin2, actionId: s.id, reason: "again" }), 409);
});

test("lifting a mute removes only that mute", async () => {
  const w = world();
  const r = await w.report({ severity: "P2" });
  const m = await w.svc.imposeAction({ actor: admin1, reportId: r._id, body: { actionType: "feature_restriction", feature: "messaging", durationDays: 7, reason: "x" } });
  const r2 = await w.report({ severity: "P2" });
  await w.svc.imposeAction({ actor: admin1, reportId: r2._id, body: { actionType: "feature_restriction", feature: "posting", durationDays: 7, reason: "x" } });
  await w.svc.revokeAction({ actor: admin2, actionId: m.id, reason: "ok" });
  assert.deepEqual(w.db.User.get(OFFENDER).restrictions.map((x) => x.feature), ["posting"]);
});

test("lifting a penalty does not erase a separate earlier suspension of the account", async () => {
  const w = world();
  w.db.User.docs.find((u) => u._id === OFFENDER).status = "suspended";
  w.db.User.docs.find((u) => u._id === OFFENDER).suspendedUntil = new Date(T0.getTime() + 60 * day);
  const r = await w.report({ severity: "P0", category: "threats_violence" });
  const s = await w.svc.imposeAction({ actor: admin1, reportId: r._id, body: { actionType: "temporary_suspension", durationDays: 7, reason: "x" } });
  assert.equal(new Date(w.db.User.get(OFFENDER).suspendedUntil).getTime(), T0.getTime() + 60 * day); // never shortened
  await w.svc.revokeAction({ actor: admin2, actionId: s.id, reason: "ok" });
  const user = w.db.User.get(OFFENDER);
  assert.equal(user.status, "suspended");
  assert.equal(new Date(user.suspendedUntil).getTime(), T0.getTime() + 60 * day);
});

test("only a superadmin can lift an account closure; removed content cannot be restored", async () => {
  const w = world();
  const r = await w.report({ severity: "P0", category: "threats_violence" });
  const p = await w.svc.imposeAction({ actor: admin1, reportId: r._id, body: { actionType: "permanent_termination", reason: "x" } });
  await w.svc.decideTermination({ actor: admin2, actionId: p.id, approve: true });
  await reject(w.svc.revokeAction({ actor: admin2, actionId: p.id, reason: "ok" }), 403, "SUPERADMIN_REQUIRED");
  await w.svc.revokeAction({ actor: boss1, actionId: p.id, reason: "ok" });
  assert.equal(w.db.User.get(OFFENDER).status, "active");
  const r2 = await w.report({ entityType: "comment", entityId: oid(901) });
  const c = await w.svc.imposeAction({ actor: admin1, reportId: r2._id, body: { actionType: "content_removal", reason: "x" } });
  await reject(w.svc.revokeAction({ actor: admin2, actionId: c.id, reason: "ok" }), 400);
});

// ---------------------------------------------------------------- appeals: the person
async function suspended(w) {
  const r = await w.report({ severity: "P0", category: "threats_violence" });
  return w.svc.imposeAction({ actor: admin1, reportId: r._id, body: { actionType: "temporary_suspension", durationDays: 30, reason: "Threats." } });
}

test("the person can appeal once, and only their own decision", async () => {
  const w = world();
  const s = await suspended(w);
  await reject(w.svc.submitAppeal({ userId: REPORTER, actionId: s.id, statement: "This is not mine to appeal at all." }), 404);
  await reject(w.svc.submitAppeal({ userId: OFFENDER, actionId: s.id, statement: "short" }), 400, "STATEMENT_REQUIRED");
  const a = await w.svc.submitAppeal({ userId: OFFENDER, actionId: s.id, statement: "I was joking and I have apologised." });
  await w.flush();
  assert.equal(a.status, "pending");
  const saved = w.db.Appeal.get(a.id);
  assert.equal(saved.original.actionType, "temporary_suspension");
  assert.equal(saved.universityId, U1);
  await reject(w.svc.submitAppeal({ userId: OFFENDER, actionId: s.id, statement: "Trying a second time now." }), 409, "ALREADY_APPEALED");
  const note = w.calls.moderators.find((c) => c.kind === "appeal_filed");
  assert.deepEqual(note.excludeIds, [A1]); // the deciding moderator is not asked to review it
});

test("two simultaneous appeals: the unique index leaves only one", async () => {
  const w = world();
  const s = await suspended(w);
  const results = await Promise.allSettled([
    w.svc.submitAppeal({ userId: OFFENDER, actionId: s.id, statement: "First tap of the button." }),
    w.svc.submitAppeal({ userId: OFFENDER, actionId: s.id, statement: "Second tap of the button." }),
  ]);
  assert.equal(results.filter((r) => r.status === "fulfilled").length >= 1, true);
  assert.equal(w.db.Appeal.docs.length, 1);
});

test("a proposed closure cannot be appealed until it is decided; the window closes after 30 days", async () => {
  const w = world();
  const r = await w.report({ severity: "P0", category: "threats_violence" });
  const p = await w.svc.imposeAction({ actor: admin1, reportId: r._id, body: { actionType: "permanent_termination", reason: "x" } });
  await reject(w.svc.submitAppeal({ userId: OFFENDER, actionId: p.id, statement: "I should be allowed to appeal." }), 409, "NOT_FINAL");
  const w2 = world();
  const s = await suspended(w2);
  w2.advance(31 * day);
  await reject(w2.svc.submitAppeal({ userId: OFFENDER, actionId: s.id, statement: "I am appealing very late." }), 409, "APPEAL_WINDOW_CLOSED");
});

test("a restricted case's appeal is flagged so only a superadmin can see it", async () => {
  const w = world();
  const secret = await w.report({ restrictedToSuperadmin: true, severity: "P0", category: "child_safety" });
  const s = await w.svc.imposeAction({ actor: boss1, reportId: secret._id, body: { actionType: "temporary_suspension", durationDays: 30, reason: "x" } });
  const a = await w.svc.submitAppeal({ userId: OFFENDER, actionId: s.id, statement: "I did not do this at all." });
  assert.equal(w.db.Appeal.get(a.id).restrictedToSuperadmin, true);
  await reject(w.svc.getAppeal({ actor: admin2, appealId: a.id }), 404);
  const seen = await w.svc.listAppeals({ actor: admin2, query: {} });
  assert.equal(seen.data.length, 0);
  assert.equal((await w.svc.listAppeals({ actor: boss2, query: {} })).data.length, 1);
});

// ---------------------------------------------------------------- appeals: the moderator
async function appealed(w) {
  const s = await suspended(w);
  const a = await w.svc.submitAppeal({ userId: OFFENDER, actionId: s.id, statement: "I was joking and I have apologised." });
  return { s, a };
}

test("the moderator who imposed the penalty cannot decide the appeal; an independent one can", async () => {
  const w = world();
  const { a } = await appealed(w);
  await reject(w.svc.decideAppeal({ actor: admin1, appealId: a.id, body: { decision: "upheld", reason: "Standing." } }), 403, "REVIEWER_MUST_BE_INDEPENDENT");
  const done = await w.svc.decideAppeal({ actor: admin2, appealId: a.id, body: { decision: "upheld", reason: "The evidence is clear." } });
  assert.equal(done.status, "upheld");
  const saved = w.db.Appeal.get(a.id);
  assert.equal(saved.reviewerId, A2);
  assert.equal(saved.decisionReason, "The evidence is clear.");
  await reject(w.svc.decideAppeal({ actor: boss1, appealId: a.id, body: { decision: "overturned", reason: "Changed my mind." } }), 409);
});

test("an appeal decision needs a reason the person will see", async () => {
  const w = world();
  const { a } = await appealed(w);
  await reject(w.svc.decideAppeal({ actor: admin2, appealId: a.id, body: { decision: "upheld", reason: "" } }), 400);
});

test("overturning a suspension lifts it at once and marks the decision overturned", async () => {
  const w = world();
  const { s, a } = await appealed(w);
  await w.svc.decideAppeal({ actor: admin2, appealId: a.id, body: { decision: "overturned", reason: "Context was missing." } });
  await w.flush();
  assert.equal(w.db.ModerationAction.get(s.id).status, "overturned");
  const user = w.db.User.get(OFFENDER);
  assert.equal(user.status, "active");
  assert.equal(user.suspendedUntil, null);
  assert.ok(w.calls.user.some((c) => c.kind === "appeal_decided"));
});

test("overturning a mute removes it; a warning has nothing to lift", async () => {
  const w = world();
  const r = await w.report({ severity: "P2" });
  const m = await w.svc.imposeAction({ actor: admin1, reportId: r._id, body: { actionType: "feature_restriction", feature: "messaging", durationDays: 7, reason: "x" } });
  const a = await w.svc.submitAppeal({ userId: OFFENDER, actionId: m.id, statement: "That message was misread by all." });
  await w.svc.decideAppeal({ actor: admin2, appealId: a.id, body: { decision: "overturned", reason: "Misread." } });
  assert.deepEqual(w.db.User.get(OFFENDER).restrictions, []);
});

test("reducing a suspension shortens it, and it must be shorter", async () => {
  const w = world();
  const { s, a } = await appealed(w);
  await reject(w.svc.decideAppeal({ actor: admin2, appealId: a.id, body: { decision: "reduced", reducedToDays: 30, reason: "x" } }), 400, "MUST_BE_SHORTER");
  await w.svc.decideAppeal({ actor: admin2, appealId: a.id, body: { decision: "reduced", reducedToDays: 10, reason: "First offence." } });
  assert.equal(new Date(w.db.ModerationAction.get(s.id).expiresAt).getTime(), T0.getTime() + 10 * day);
  assert.equal(new Date(w.db.User.get(OFFENDER).suspendedUntil).getTime(), T0.getTime() + 10 * day);
  assert.equal(w.db.Appeal.get(a.id).status, "reduced");
});

test("reducing a suspension below the time already served ends it", async () => {
  const w = world();
  const { s, a } = await appealed(w);
  w.advance(20 * day);
  await w.svc.decideAppeal({ actor: admin2, appealId: a.id, body: { decision: "reduced", reducedToDays: 10, reason: "Time served." } });
  assert.equal(w.db.ModerationAction.get(s.id).status, "expired");
  assert.equal(w.db.User.get(OFFENDER).status, "active");
});

test("a closure appeal needs an independent SUPERADMIN; reducing turns it into a suspension", async () => {
  const w = world();
  const r = await w.report({ severity: "P0", category: "threats_violence" });
  const p = await w.svc.imposeAction({ actor: admin1, reportId: r._id, body: { actionType: "permanent_termination", reason: "x" } });
  await w.svc.decideTermination({ actor: boss1, actionId: p.id, approve: true });
  const a = await w.svc.submitAppeal({ userId: OFFENDER, actionId: p.id, statement: "Please look at this again, I was wrong." });
  await reject(w.svc.decideAppeal({ actor: admin2, appealId: a.id, body: { decision: "overturned", reason: "x" } }), 403, "SUPERADMIN_REQUIRED");
  await reject(w.svc.decideAppeal({ actor: boss1, appealId: a.id, body: { decision: "overturned", reason: "x" } }), 403, "REVIEWER_MUST_BE_INDEPENDENT");
  await w.svc.decideAppeal({ actor: boss2, appealId: a.id, body: { decision: "reduced", reducedToDays: 45, reason: "Reduced to a suspension." } });
  const action = w.db.ModerationAction.get(p.id);
  assert.equal(action.actionType, "temporary_suspension");
  assert.equal(action.reducedFrom, "permanent_termination");
  const user = w.db.User.get(OFFENDER);
  assert.equal(user.status, "suspended");
  assert.equal(new Date(user.suspendedUntil).getTime(), T0.getTime() + 45 * day);
});

test("overturning a closure restores the account", async () => {
  const w = world();
  const r = await w.report({ severity: "P0", category: "threats_violence" });
  const p = await w.svc.imposeAction({ actor: admin1, reportId: r._id, body: { actionType: "permanent_termination", reason: "x" } });
  await w.svc.decideTermination({ actor: admin2, actionId: p.id, approve: true });
  const a = await w.svc.submitAppeal({ userId: OFFENDER, actionId: p.id, statement: "This was a case of mistaken identity." });
  await w.svc.decideAppeal({ actor: boss1, appealId: a.id, body: { decision: "overturned", reason: "Wrong person." } });
  assert.equal(w.db.User.get(OFFENDER).status, "active");
});

// ---------------------------------------------------------------- housekeeping
test("the sweep ends penalties whose time is up", async () => {
  const w = world();
  const r = await w.report({ severity: "P0", category: "threats_violence" });
  const s = await w.svc.imposeAction({ actor: admin1, reportId: r._id, body: { actionType: "temporary_suspension", durationDays: 7, reason: "x" } });
  const r2 = await w.report({ severity: "P2" });
  await w.svc.imposeAction({ actor: admin1, reportId: r2._id, body: { actionType: "feature_restriction", feature: "messaging", durationDays: 3, reason: "x" } });
  w.advance(5 * day);
  let out = await w.svc.sweepExpired();
  assert.deepEqual(out, { ended: 1, lapsed: 0 });
  assert.deepEqual(w.db.User.get(OFFENDER).restrictions, []);
  assert.equal(w.db.User.get(OFFENDER).status, "suspended");
  w.advance(3 * day);
  out = await w.svc.sweepExpired();
  assert.equal(out.ended, 1);
  assert.equal(w.db.ModerationAction.get(s.id).status, "expired");
  assert.equal(w.db.User.get(OFFENDER).status, "active");
  assert.deepEqual(await w.svc.sweepExpired(), { ended: 0, lapsed: 0 }); // safe to run again
});

test("a closure nobody approves lapses after a week and the account is restored", async () => {
  const w = world();
  const r = await w.report({ severity: "P0", category: "threats_violence" });
  const p = await w.svc.imposeAction({ actor: admin1, reportId: r._id, body: { actionType: "permanent_termination", reason: "x" } });
  w.advance(8 * day);
  const out = await w.svc.sweepExpired();
  assert.equal(out.lapsed, 1);
  assert.equal(w.db.ModerationAction.get(p.id).status, "rejected");
  assert.equal(w.db.User.get(OFFENDER).status, "active");
});

// ---------------------------------------------------------------- moderator reads
test("the closures queue shows who can approve, and hides restricted and other-university cases", async () => {
  const w = world();
  const r = await w.report({ severity: "P0", category: "threats_violence" });
  await w.svc.imposeAction({ actor: admin1, reportId: r._id, body: { actionType: "permanent_termination", reason: "x" } });
  const secret = await w.report({ restrictedToSuperadmin: true, severity: "P0", category: "child_safety", reportedUserId: OTHER_UNI, universityId: U2 });
  await w.svc.imposeAction({ actor: boss1, reportId: secret._id, body: { actionType: "permanent_termination", reason: "x" } });

  const forProposer = await w.svc.listActions({ actor: admin1, query: {} });
  assert.equal(forProposer.data.length, 1);
  assert.equal(forProposer.data[0].canApprove, false);
  const forOther = await w.svc.listActions({ actor: admin2, query: {} });
  assert.equal(forOther.data[0].canApprove, true);
  assert.equal(forOther.data[0].proposedByName, "Admin One");
  const forBoss = await w.svc.listActions({ actor: boss2, query: {} });
  assert.equal(forBoss.data.length, 2);
  const none = await w.svc.listActions({ actor: adminU2, query: {} });
  assert.equal(none.data.length, 0);
});

test("the appeals queue says why a moderator cannot decide an appeal", async () => {
  const w = world();
  await appealed(w);
  const mine = await w.svc.listAppeals({ actor: admin1, query: {} });
  assert.equal(mine.data[0].canDecide, false);
  assert.match(mine.data[0].cannotDecideBecause, /another moderator/i);
  const theirs = await w.svc.listAppeals({ actor: admin2, query: {} });
  assert.equal(theirs.data[0].canDecide, true);
});

test("an appeal's detail includes the evidence copy and the original reason", async () => {
  const w = world();
  const { a } = await appealed(w);
  const d = await w.svc.getAppeal({ actor: admin2, appealId: a.id });
  assert.equal(d.action.reason, "Threats.");
  assert.deepEqual(d.action.evidence.snapshot, { content: "bad words" });
  assert.equal(d.action.durationDays, 30);
  assert.equal(d.canDecide, true);
});

// ---------------------------------------------------------------- what the person sees
test("the person's standing hides proposed and rejected closures, and offers an appeal only on final decisions", async () => {
  const w = world();
  const r = await w.report({ severity: "P0", category: "threats_violence" });
  const p = await w.svc.imposeAction({ actor: admin1, reportId: r._id, body: { actionType: "permanent_termination", reason: "x" } });
  const mod = createModerationService({ models: { ...w.db, Post: new Coll(), Comment: new Coll(), Message: new Coll(), Conversation: new Coll(), Event: new Coll(), Note: new Coll(), PastPaper: new Coll(), DigitalResource: new Coll(), Community: new Coll(), CommunityMembership: new Coll(), Discussion: new Coll() }, now: () => w.clock.t });
  let standing = await mod.getAccountStanding(OFFENDER);
  assert.equal(standing.actions.length, 0); // the pending closure is not shown
  assert.equal(standing.block.code, "ACCOUNT_SUSPENDED"); // but the hold is
  await w.svc.decideTermination({ actor: admin2, actionId: p.id, approve: true });
  standing = await mod.getAccountStanding(OFFENDER);
  assert.equal(standing.actions.length, 1);
  assert.equal(standing.actions[0].canAppeal, true);
  assert.equal(standing.block.code, "ACCOUNT_TERMINATED");
});
