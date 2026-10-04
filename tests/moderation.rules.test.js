"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const R = require("../src/utils/moderation.rules");

const NOW = new Date("2026-10-05T12:00:00Z");
const hoursFrom = (h) => new Date(NOW.getTime() + h * 3600 * 1000);

test("every category maps to a severity and a section (or null for 'other')", () => {
  assert.equal(R.CATEGORIES.length, 15);
  for (const c of R.CATEGORIES) {
    assert.ok(R.DEFAULT_SEVERITY[c.id], `no default severity for ${c.id}`);
    assert.ok(R.SEVERITIES.includes(R.DEFAULT_SEVERITY[c.id]));
    if (c.id !== "other") assert.ok(c.section, `${c.id} has no standards section`);
  }
});

test("child safety is ALWAYS P0, whatever the reporter says", () => {
  assert.equal(R.severityFor({ category: "child_safety", imminent: false }).severity, "P0");
  assert.equal(R.severityFor({ category: "child_safety" }).severity, "P0");
  assert.equal(R.severityFor({ category: "child_safety", imminent: true }).severity, "P0");
});

test("imminent threats and self-harm escalate to P0; the flag does nothing elsewhere", () => {
  assert.equal(R.severityFor({ category: "threats_violence", imminent: false }).severity, "P1");
  assert.equal(R.severityFor({ category: "threats_violence", imminent: true }).severity, "P0");
  assert.equal(R.severityFor({ category: "self_harm_concern", imminent: true }).severity, "P0");
  // a reporter cannot jump the queue by ticking 'imminent' on a spam report
  assert.equal(R.severityFor({ category: "spam", imminent: true }).severity, "P3");
  assert.equal(R.severityFor({ category: "harassment", imminent: true }).severity, "P2");
  // only a literal boolean true counts
  assert.equal(R.severityFor({ category: "threats_violence", imminent: "true" }).severity, "P1");
});

test("unknown category is rejected, not defaulted", () => {
  assert.throws(() => R.severityFor({ category: "made_up" }), /Unknown category/);
});

test("dueAt scales with severity", () => {
  assert.equal(R.dueAtFor("P0", NOW).getTime(), hoursFrom(1).getTime());
  assert.equal(R.dueAtFor("P1", NOW).getTime(), hoursFrom(4).getTime());
  assert.equal(R.dueAtFor("P2", NOW).getTime(), hoursFrom(24).getTime());
  assert.equal(R.dueAtFor("P3", NOW).getTime(), hoursFrom(72).getTime());
  assert.throws(() => R.dueAtFor("P9", NOW));
});

test("who may enforce what", () => {
  assert.equal(R.canEnforce({ role: "student", action: "warning" }).ok, false);
  assert.equal(R.canEnforce({ role: "lecturer", action: "warning" }).ok, false);
  assert.equal(R.canEnforce({ role: "admin", action: "warning" }).ok, true);
  assert.equal(R.canEnforce({ role: "admin", action: "temporary_suspension" }).ok, true);
  // admins may terminate only in severe cases
  assert.equal(R.canEnforce({ role: "admin", action: "permanent_termination", severity: "P3" }).ok, false);
  assert.equal(R.canEnforce({ role: "admin", action: "permanent_termination", severity: "P2" }).ok, false);
  assert.equal(R.canEnforce({ role: "admin", action: "permanent_termination", severity: "P1" }).ok, true);
  assert.equal(R.canEnforce({ role: "admin", action: "permanent_termination", severity: "P0" }).ok, true);
  assert.equal(R.canEnforce({ role: "superadmin", action: "permanent_termination", severity: "P3" }).ok, true);
  assert.equal(R.canEnforce({ role: "superadmin", action: "invent_a_punishment" }).ok, false);
});

test("accountBlock: active accounts pass; suspended, terminated and deleted are blocked", () => {
  assert.equal(R.accountBlock({ status: "active" }, NOW), null);
  assert.equal(R.accountBlock({}, NOW), null, "legacy users with no status field are active");
  assert.equal(R.accountBlock({ status: "suspended" }, NOW).code, "ACCOUNT_SUSPENDED");
  assert.equal(R.accountBlock({ status: "terminated" }, NOW).code, "ACCOUNT_TERMINATED");
  assert.equal(R.accountBlock({ status: "active", deletedAt: NOW }, NOW).code, "ACCOUNT_DELETED");
  assert.equal(R.accountBlock(null, NOW).code, "ACCOUNT_NOT_FOUND");
});

test("accountBlock: a temporary suspension ends by itself, an open-ended one does not", () => {
  const future = hoursFrom(48), past = hoursFrom(-1);
  const stillOn = R.accountBlock({ status: "suspended", suspendedUntil: future }, NOW);
  assert.equal(stillOn.code, "ACCOUNT_SUSPENDED");
  assert.equal(stillOn.until, future.toISOString());
  assert.equal(R.accountBlock({ status: "suspended", suspendedUntil: past }, NOW), null);
  // an admin's legacy 'suspended' (no end date) stays suspended until someone reactivates
  assert.equal(R.accountBlock({ status: "suspended", suspendedUntil: null }, NOW).until, null);
  assert.equal(R.accountBlock({ status: "suspended" }, NOW).code, "ACCOUNT_SUSPENDED");
});

test("suspended and terminated accounts are told they can appeal; deleted are not", () => {
  assert.equal(R.accountBlock({ status: "suspended" }, NOW).appealable, true);
  assert.equal(R.accountBlock({ status: "terminated" }, NOW).appealable, true);
  assert.notEqual(R.accountBlock({ deletedAt: NOW }, NOW).appealable, true);
});

test("restrictions expire; open-ended ones stay", () => {
  const user = { restrictions: [
    { feature: "posting", until: hoursFrom(5) },
    { feature: "messaging", until: hoursFrom(-5) },
    { feature: "uploads", until: null },
  ] };
  assert.deepEqual(R.activeRestrictions(user, NOW).map((r) => r.feature).sort(), ["posting", "uploads"]);
  assert.equal(R.isRestricted(user, "posting", NOW), true);
  assert.equal(R.isRestricted(user, "messaging", NOW), false);
  assert.equal(R.isRestricted(user, "uploads", NOW), true);
  assert.equal(R.isRestricted({}, "posting", NOW), false);
});

test("appeal eligibility: window, duplicates, overturned", () => {
  const action = (daysAgo, extra = {}) => ({ createdAt: new Date(NOW.getTime() - daysAgo * 86400000), status: "active", ...extra });
  assert.equal(R.appealEligibility({ action: action(1), now: NOW }).ok, true);
  assert.equal(R.appealEligibility({ action: action(30), now: NOW }).ok, true);
  assert.equal(R.appealEligibility({ action: action(31), now: NOW }).reason, "appeal_window_closed");
  assert.equal(R.appealEligibility({ action: action(1), existingAppeal: { _id: "a" }, now: NOW }).reason, "already_appealed");
  assert.equal(R.appealEligibility({ action: action(1, { status: "overturned" }), now: NOW }).reason, "already_overturned");
  assert.equal(R.appealEligibility({ action: null, now: NOW }).reason, "action_not_found");
});

test("an appeal is never decided by the person who imposed the action", () => {
  const action = { moderatorId: "mod1" };
  assert.equal(R.canReviewAppeal({ reviewerId: "mod1", reviewerRole: "admin", action }).reason, "reviewer_must_be_independent");
  assert.equal(R.canReviewAppeal({ reviewerId: "mod1", reviewerRole: "superadmin", action }).ok, false);
  assert.equal(R.canReviewAppeal({ reviewerId: "mod2", reviewerRole: "admin", action }).ok, true);
  assert.equal(R.canReviewAppeal({ reviewerId: "mod2", reviewerRole: "student", action }).ok, false);
});

test("report throttle: normal limits, doubled for child safety and imminent danger", () => {
  const t = (lastHourCount, lastDayCount, extra = {}) => R.reportThrottle({ lastHourCount, lastDayCount, category: "spam", ...extra });
  assert.equal(t(9, 0).limited, false);
  assert.equal(t(10, 0).limited, true);
  assert.equal(t(0, 30).limited, true);
  assert.equal(t(10, 0, { category: "child_safety" }).limited, false, "child safety has headroom");
  assert.equal(t(20, 0, { category: "child_safety" }).limited, true, "but not unlimited");
  assert.equal(t(15, 0, { category: "threats_violence", imminent: true }).limited, false);
});

test("reporters are never told they were judged to be acting in bad faith", () => {
  const base = { status: "resolved" };
  assert.equal(R.outcomeForReporter({ status: "open" }), "Received");
  assert.equal(R.outcomeForReporter({ status: "in_review" }), "Under review");
  assert.equal(R.outcomeForReporter({ status: "escalated" }), "Under review");
  assert.equal(R.outcomeForReporter({ ...base, resolution: { outcome: "violation_confirmed" } }), "Action was taken");
  assert.equal(R.outcomeForReporter({ ...base, resolution: { outcome: "no_violation" } }), "No violation found");
  assert.equal(R.outcomeForReporter({ ...base, resolution: { outcome: "bad_faith" } }), "Closed");
  assert.equal(R.outcomeForReporter({ status: "dismissed", resolution: { outcome: "insufficient_info" } }), "Closed");
});

test("description sanitising", () => {
  assert.equal(R.sanitizeDescription(undefined), "");
  assert.equal(R.sanitizeDescription(12345), "");
  assert.equal(R.sanitizeDescription("  hello\u0000\u0007 world  "), "hello world");
  assert.equal(R.sanitizeDescription("a\n\n\n\n\n\nb"), "a\n\n\nb");
  assert.equal(R.sanitizeDescription("x".repeat(5000)).length, R.REPORT_LIMITS.descriptionMax);
});

test("reference codes are well-formed, readable and effectively unique", () => {
  const seen = new Set();
  for (let i = 0; i < 2000; i++) {
    const code = R.referenceCode();
    assert.match(code, /^RPT-[A-HJ-NP-Z2-9]{8}$/);
    seen.add(code);
  }
  assert.equal(seen.size, 2000);
});

test("object id validation", () => {
  assert.equal(R.isObjectIdLike("507f1f77bcf86cd799439011"), true);
  assert.equal(R.isObjectIdLike("507f1f77bcf86cd79943901"), false);
  assert.equal(R.isObjectIdLike("zzzzzzzzzzzzzzzzzzzzzzzz"), false);
  assert.equal(R.isObjectIdLike({ $ne: null }), false, "query-operator objects are rejected");
  assert.equal(R.isObjectIdLike(null), false);
});
