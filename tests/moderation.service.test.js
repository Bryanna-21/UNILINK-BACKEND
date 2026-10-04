"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createModerationService, SafetyError } = require("../src/services/moderation.service");
const standards = require("../src/content/communityStandards");

// ---------------------------------------------------------------- tiny in-memory "database"
const oid = (n) => String(n).padStart(24, "0");
function matches(doc, filter) {
  return Object.entries(filter).every(([k, cond]) => {
    const v = doc[k];
    if (cond && typeof cond === "object" && !(cond instanceof Date) && !Array.isArray(cond)) {
      if ("$in" in cond) return cond.$in.map(String).includes(String(v));
      if ("$gte" in cond) return new Date(v) >= cond.$gte;
      if ("$lt" in cond) return new Date(v) < cond.$lt;
      return false;
    }
    if (cond === null) return v === null || v === undefined;
    return String(v) === String(cond);
  });
}
class FakeModel {
  constructor(docs = []) { this.docs = docs.map((d) => ({ ...d })); this.created = []; this.updates = []; }
  _q(list) {
    let out = list;
    const q = {
      sort: (spec) => { const [[k, dir]] = Object.entries(spec); out = [...out].sort((a, b) => (new Date(a[k]) - new Date(b[k])) * dir); return q; },
      limit: (n) => { out = out.slice(0, n); return q; },
      select: () => q,
      lean: async () => out,
    };
    return q;
  }
  findById(id) { const d = this.docs.find((x) => String(x._id) === String(id)); const q = this._q(d ? [d] : []); return { select: () => ({ lean: async () => d || null }), lean: async () => d || null }; }
  findOne(filter) { const d = this.docs.find((x) => matches(x, filter)); return { select: () => ({ lean: async () => d || null }), lean: async () => d || null }; }
  find(filter) { return this._q(this.docs.filter((x) => matches(x, filter))); }
  async countDocuments(filter) { return this.docs.filter((x) => matches(x, filter)).length; }
  async create(doc) { const saved = { _id: oid(900000 + this.docs.length + 1), ...doc }; this.docs.push(saved); this.created.push(saved); return saved; }
  async updateOne(filter, update) { const d = this.docs.find((x) => matches(x, filter)); this.updates.push({ filter, update }); if (d && update.$set) Object.assign(d, update.$set); return { modifiedCount: d ? 1 : 0 }; }
}

const NOW = new Date("2026-10-05T12:00:00Z");
const U1 = "uni000000000000000000a1", U2 = "uni000000000000000000b2";

function world(extra = {}) {
  const models = {
    User: new FakeModel([
      { _id: oid(1), role: "student", universityId: U1, name: "Reporter" },
      { _id: oid(2), role: "student", universityId: U1, name: "Author", bio: "hi" },
      { _id: oid(3), role: "student", universityId: U2, name: "Elsewhere" },
      { _id: oid(4), role: "admin", universityId: U1, name: "An Admin" },
      { _id: oid(5), role: "superadmin", universityId: null, name: "Boss" },
      { _id: oid(6), role: "student", universityId: U1, name: "Third" },
    ]),
    Post: new FakeModel([
      { _id: oid(10), userId: oid(2), universityId: U1, title: "T", content: "mean words", media: [{ url: "https://x/a.jpg", type: "image" }, { url: "https://x/v.mp4", type: "video" }], communityId: null },
      { _id: oid(11), userId: oid(2), universityId: U2, content: "other uni", media: [], communityId: null },
      { _id: oid(12), userId: oid(2), universityId: U1, content: "secret club", media: [], communityId: oid(500) },
      { _id: oid(13), userId: oid(1), universityId: U1, content: "my own", media: [], communityId: null },
      { _id: oid(14), userId: oid(4), universityId: U1, content: "admin post", media: [], communityId: null },
    ]),
    Comment: new FakeModel([{ _id: oid(20), postId: oid(10), userId: oid(2), content: "rude comment" }]),
    Message: new FakeModel([
      { _id: oid(30), conversationId: oid(70), senderId: oid(2), text: "you idiot", createdAt: new Date("2026-10-05T10:05:00Z") },
      { _id: oid(31), conversationId: oid(70), senderId: oid(1), text: "stop", createdAt: new Date("2026-10-05T10:04:00Z") },
      { _id: oid(32), conversationId: oid(70), senderId: oid(2), text: "i said stop", createdAt: new Date("2026-10-05T10:03:00Z") },
    ]),
    Conversation: new FakeModel([
      { _id: oid(70), participantIds: [oid(1), oid(2)] },
      { _id: oid(71), participantIds: [oid(2), oid(6)] },
    ]),
    Event: new FakeModel([{ _id: oid(40), createdBy: oid(2), title: "Party", description: "d", location: "l", date: NOW }]),
    Note: new FakeModel([{ _id: oid(50), uploadedBy: oid(2), title: "Notes", fileUrl: "https://x/n.pdf" }]),
    PastPaper: new FakeModel([]), DigitalResource: new FakeModel([]),
    Community: new FakeModel([
      { _id: oid(500), universityId: U1, name: "Secret", isPublic: false, createdBy: oid(2), description: "hush" },
      { _id: oid(501), universityId: U1, name: "Open", isPublic: true, createdBy: oid(2) },
    ]),
    CommunityMembership: new FakeModel([]),
    Discussion: new FakeModel([{ _id: oid(60), userId: oid(2), courseId: "c1", content: "off-topic rant" }]),
    ContentReport: new FakeModel(),
    ModerationAction: new FakeModel(),
    Appeal: new FakeModel(),
    ...extra,
  };
  const notified = [];
  const notifier = { reportFiled: async (r) => { notified.push(r); } };
  const svc = createModerationService({ models, notifier, now: () => NOW });
  return { models, svc, notified };
}
const asReporter = (id = oid(1)) => ({ id });
const report = (svc, body, reporter = asReporter()) => svc.createReport({ reporter, body });
const fails = async (promise, status, code) => {
  await assert.rejects(promise, (e) => { assert.ok(e instanceof SafetyError, `not a SafetyError: ${e && e.message}`); assert.equal(e.status, status); if (code) assert.equal(e.code, code); return true; });
};

// ---------------------------------------------------------------- input validation
test("rejects unknown type, unknown category, malformed ids and query-operator ids", async () => {
  const { svc } = world();
  await fails(report(svc, { entityType: "nonsense", entityId: oid(10), category: "spam" }), 400);
  await fails(report(svc, { entityType: "post", entityId: oid(10), category: "made_up" }), 400);
  await fails(report(svc, { entityType: "post", entityId: "not-an-id", category: "spam" }), 400);
  await fails(report(svc, { entityType: "post", entityId: { $ne: null }, category: "spam" }), 400);
  await fails(report(svc, undefined), 400);
});

// ---------------------------------------------------------------- the happy path
test("a post report stores a snapshot, the owner, scope, severity and a receipt", async () => {
  const { svc, models } = world();
  const res = await report(svc, { entityType: "post", entityId: oid(10), category: "harassment", description: "  targeting me  " });
  assert.equal(res.duplicate, false);
  assert.match(res.reference, /^RPT-[A-Z2-9]{8}$/);
  assert.equal(res.status, "open");
  assert.equal("reporterId" in res, false, "the receipt must not echo reporter identity");
  const saved = models.ContentReport.created[0];
  assert.equal(saved.reportedUserId, oid(2));
  assert.equal(saved.reporterId, oid(1));
  assert.equal(saved.universityId, U1);
  assert.equal(saved.severity, "P2");
  assert.equal(saved.description, "targeting me");
  assert.equal(saved.evidence.snapshot.content, "mean words");
  assert.equal(saved.evidence.snapshot.media.length, 2);
  assert.equal(saved.events[0].type, "created");
  assert.equal(saved.dueAt.getTime(), NOW.getTime() + 24 * 3600 * 1000);
  assert.equal(saved.restrictedToSuperadmin, false);
});

test("every reportable type resolves to its owner", async () => {
  const { svc, models } = world();
  const cases = [
    ["profile", oid(2)], ["post", oid(10)], ["comment", oid(20)], ["event", oid(40)],
    ["discussion", oid(60)], ["note", oid(50)], ["community", oid(501)],
  ];
  for (const [entityType, entityId] of cases) {
    const r = await report(svc, { entityType, entityId, category: "spam" });
    assert.equal(r.duplicate, false, entityType);
  }
  assert.ok(models.ContentReport.created.every((c) => c.reportedUserId === oid(2)), "owner differs per model (userId/createdBy/uploadedBy) but all resolve");
});

// ---------------------------------------------------------------- you can only report what you can see
test("content from another university is indistinguishable from content that does not exist", async () => {
  const { svc } = world();
  const other = report(svc, { entityType: "post", entityId: oid(11), category: "spam" });
  const missing = report(svc, { entityType: "post", entityId: oid(99999), category: "spam" });
  await fails(other, 404);
  await fails(missing, 404);
  const a = await other.catch((e) => e), b = await missing.catch((e) => e);
  assert.equal(a.message, b.message, "identical message: no probing");
});

test("members-only community content cannot be reported by outsiders, but can by members", async () => {
  const { svc, models } = world();
  await fails(report(svc, { entityType: "post", entityId: oid(12), category: "spam" }), 404);
  await fails(report(svc, { entityType: "community", entityId: oid(500), category: "spam" }), 404);
  models.CommunityMembership.docs.push({ communityId: oid(500), userId: oid(1), status: "active" });
  assert.equal((await report(svc, { entityType: "post", entityId: oid(12), category: "spam" })).duplicate, false);
  // a banned member is no longer a member
  models.CommunityMembership.docs[0].status = "banned";
  await fails(report(svc, { entityType: "post", entityId: oid(12), category: "harassment" }), 404);
});

test("a superadmin can report across universities", async () => {
  const { svc } = world();
  const r = await report(svc, { entityType: "post", entityId: oid(11), category: "spam" }, asReporter(oid(5)));
  assert.equal(r.duplicate, false);
});

// ---------------------------------------------------------------- abuse prevention
test("you cannot report yourself or your own content", async () => {
  const { svc } = world();
  await fails(report(svc, { entityType: "post", entityId: oid(13), category: "spam" }), 400);
  await fails(report(svc, { entityType: "profile", entityId: oid(1), category: "spam" }), 400);
});

test("reporting the same thing twice returns the same receipt and creates nothing new", async () => {
  const { svc, models } = world();
  const first = await report(svc, { entityType: "post", entityId: oid(10), category: "spam" });
  const second = await report(svc, { entityType: "post", entityId: oid(10), category: "harassment" });
  assert.equal(second.duplicate, true);
  assert.equal(second.reference, first.reference);
  assert.equal(models.ContentReport.created.length, 1);
});

test("a resolved report does not block a fresh one about the same item", async () => {
  const { svc, models } = world();
  await report(svc, { entityType: "post", entityId: oid(10), category: "spam" });
  models.ContentReport.docs[0].status = "resolved";
  const again = await report(svc, { entityType: "post", entityId: oid(10), category: "spam" });
  assert.equal(again.duplicate, false);
});

test("throttle: the 11th ordinary report in an hour is refused; child safety still gets through", async () => {
  const { svc, models } = world();
  for (let i = 0; i < 10; i++) {
    models.ContentReport.docs.push({ _id: oid(8000 + i), reporterId: oid(1), createdAt: new Date(NOW.getTime() - 60 * 1000), status: "resolved", entityType: "post", entityId: oid(7000 + i) });
  }
  await fails(report(svc, { entityType: "post", entityId: oid(10), category: "spam" }), 429, "RATE_LIMITED");
  const urgent = await report(svc, { entityType: "post", entityId: oid(10), category: "child_safety" });
  assert.equal(urgent.duplicate, false, "an emergency must not be blockable by a flood");
});

test("a reporter blocked for abuse, or restricted from reporting, is refused", async () => {
  const w1 = world();
  w1.models.User.docs[0].reportingBlockedUntil = new Date(NOW.getTime() + 3600 * 1000);
  await fails(report(w1.svc, { entityType: "post", entityId: oid(10), category: "spam" }), 403, "REPORTING_RESTRICTED");
  const w2 = world();
  w2.models.User.docs[0].restrictions = [{ feature: "reporting", until: null }];
  await fails(report(w2.svc, { entityType: "post", entityId: oid(10), category: "spam" }), 403, "REPORTING_RESTRICTED");
  const w3 = world();
  w3.models.User.docs[0].reportingBlockedUntil = new Date(NOW.getTime() - 1000);
  assert.equal((await report(w3.svc, { entityType: "post", entityId: oid(10), category: "spam" })).duplicate, false, "an expired block no longer applies");
});

// ---------------------------------------------------------------- severity and confidentiality
test("child safety is P0 and visible only to superadmins", async () => {
  const { svc, models } = world();
  await report(svc, { entityType: "post", entityId: oid(10), category: "child_safety", imminent: false });
  const saved = models.ContentReport.created[0];
  assert.equal(saved.severity, "P0");
  assert.equal(saved.restrictedToSuperadmin, true);
  assert.equal(saved.dueAt.getTime(), NOW.getTime() + 3600 * 1000);
});

test("imminent threats go to P0; ticking 'imminent' on spam does not", async () => {
  const { svc, models } = world();
  await report(svc, { entityType: "post", entityId: oid(10), category: "threats_violence", imminent: true });
  await report(svc, { entityType: "comment", entityId: oid(20), category: "spam", imminent: true });
  assert.equal(models.ContentReport.created[0].severity, "P0");
  assert.equal(models.ContentReport.created[1].severity, "P3");
});

test("reports about an administrator are visible to superadmins only", async () => {
  const { svc, models } = world();
  await report(svc, { entityType: "post", entityId: oid(14), category: "harassment" });
  await report(svc, { entityType: "profile", entityId: oid(4), category: "impersonation" });
  assert.ok(models.ContentReport.created.every((r) => r.restrictedToSuperadmin === true));
});

// ---------------------------------------------------------------- messages (private content)
test("a message can be reported only by a participant, and arrives with context", async () => {
  const { svc, models } = world();
  const r = await report(svc, { entityType: "message", entityId: oid(30), category: "harassment" });
  assert.equal(r.duplicate, false);
  const snap = models.ContentReport.created[0].evidence.snapshot;
  assert.equal(snap.text, "you idiot");
  assert.equal(snap.context.length, 2, "the two messages before it");
  assert.equal(snap.context[0].text, "i said stop", "oldest first");
  assert.deepEqual(snap.context.map((c) => c.fromReported), [true, false]);
  // a non-participant learns nothing about the message
  await fails(report(svc, { entityType: "message", entityId: oid(30), category: "harassment" }, asReporter(oid(6))), 404);
  // the sender cannot report their own message
  await fails(report(svc, { entityType: "message", entityId: oid(30), category: "harassment" }, asReporter(oid(2))), 400);
});

// ---------------------------------------------------------------- media and video
test("media and video reports must name a real attachment of the post", async () => {
  const { svc, models } = world();
  await fails(report(svc, { entityType: "media", entityId: oid(10), category: "copyright" }), 400);
  await fails(report(svc, { entityType: "media", entityId: oid(10), category: "copyright", mediaUrl: "https://x/forged.jpg" }), 404);
  const ok = await report(svc, { entityType: "media", entityId: oid(10), category: "copyright", mediaUrl: "https://x/a.jpg" });
  assert.equal(ok.duplicate, false);
  assert.equal(models.ContentReport.created[0].mediaRef, "https://x/a.jpg");
  // reporting a photo AS a video is refused
  await fails(report(svc, { entityType: "video", entityId: oid(10), category: "copyright", mediaUrl: "https://x/a.jpg" }), 404);
  assert.equal((await report(svc, { entityType: "video", entityId: oid(10), category: "copyright", mediaUrl: "https://x/v.mp4" })).duplicate, false);
  // two different attachments of one post are two different reports
  assert.equal(models.ContentReport.created.length, 2);
});

// ---------------------------------------------------------------- notifications never lose a report
test("moderators are notified, and a notifier crash does not lose or fail the report", async () => {
  const w = world();
  await report(w.svc, { entityType: "post", entityId: oid(10), category: "harassment" });
  await new Promise((r) => setImmediate(r));
  assert.equal(w.notified.length, 1);

  const models = world().models;
  const svc = createModerationService({ models, notifier: { reportFiled: async () => { throw new Error("push service down"); } }, now: () => NOW });
  const orig = console.error; console.error = () => {};
  const r = await svc.createReport({ reporter: asReporter(), body: { entityType: "post", entityId: oid(10), category: "harassment" } });
  await new Promise((res) => setImmediate(res));
  console.error = orig;
  assert.equal(r.duplicate, false);
  assert.equal(models.ContentReport.created.length, 1);
});

// ---------------------------------------------------------------- what users get back
test("'my reports' shows only the caller's reports, with no moderator detail", async () => {
  const { svc, models } = world();
  await report(svc, { entityType: "post", entityId: oid(10), category: "harassment" });
  await report(svc, { entityType: "post", entityId: oid(10), category: "spam" }, asReporter(oid(6)));
  models.ContentReport.docs[0].status = "resolved";
  models.ContentReport.docs[0].resolution = { outcome: "bad_faith" };
  const mine = await svc.listMyReports(oid(1));
  assert.equal(mine.length, 1);
  assert.equal(mine[0].status, "Closed", "never 'bad faith'");
  assert.deepEqual(Object.keys(mine[0]).sort(), ["category", "createdAt", "entityType", "reference", "status"]);
});

test("account standing hides moderators and reporters, and says what can be appealed", async () => {
  const { svc, models } = world();
  models.User.docs[1].status = "suspended";
  models.User.docs[1].suspendedUntil = new Date(NOW.getTime() + 5 * 86400000);
  models.User.docs[1].restrictions = [{ feature: "posting", until: null }, { feature: "messaging", until: new Date(NOW.getTime() - 1000) }];
  models.ModerationAction.docs.push(
    { _id: oid(700), userId: oid(2), actionType: "temporary_suspension", reason: "Harassment", moderatorId: oid(4), reportId: oid(9), policySection: "respect-harassment", status: "active", createdAt: new Date(NOW.getTime() - 86400000) },
    { _id: oid(701), userId: oid(2), actionType: "warning", reason: "Spam", moderatorId: oid(4), status: "active", createdAt: new Date(NOW.getTime() - 40 * 86400000) },
  );
  const s = await svc.getAccountStanding(oid(2));
  assert.equal(s.block.code, "ACCOUNT_SUSPENDED");
  assert.deepEqual(s.restrictions.map((r) => r.feature), ["posting"], "the expired restriction is gone");
  assert.equal(s.actions.length, 2);
  const flat = JSON.stringify(s);
  assert.equal(flat.includes(oid(4)), false, "moderator id must not leak");
  assert.equal(flat.includes(oid(9)), false, "report id must not leak");
  const byId = Object.fromEntries(s.actions.map((a) => [a.id, a]));
  assert.equal(byId[oid(700)].canAppeal, true);
  assert.equal(byId[oid(701)].canAppeal, false, "older than 30 days");
  assert.equal(s.standards.needsAcceptance, true);
});

test("accepting the standards: only the current version is accepted", async () => {
  const { svc, models } = world();
  await fails(svc.acceptStandards(oid(1), "0.1"), 400, "STANDARDS_OUT_OF_DATE");
  const r = await svc.acceptStandards(oid(1), standards.version);
  assert.equal(r.acceptedVersion, standards.version);
  assert.equal(models.User.docs[0].standardsAcceptedVersion, standards.version);
  assert.deepEqual(models.User.docs[0].standardsAcceptedAt, NOW);
  assert.equal((await svc.getAccountStanding(oid(1))).standards.needsAcceptance, false);
});

test("config exposes categories, entity types and the enforcement ladder to both clients", () => {
  const { svc } = world();
  const c = svc.getConfig();
  assert.equal(c.categories.length, 15);
  assert.equal(c.entityTypes.length, 12);
  assert.deepEqual(c.enforcementActions.map((a) => a.id), ["warning", "content_removal", "feature_restriction", "temporary_suspension", "permanent_termination"]);
  assert.equal(c.standardsVersion, standards.version);
  assert.equal(c.appealWindowDays, 30);
});
