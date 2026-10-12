const test = require("node:test");
const assert = require("node:assert/strict");
const m = require("../src/utils/moderationAdmin.rules");

const superadmin = { role: "superadmin", universityId: null };
const platformAdmin = { role: "admin", universityId: null };
const uniAdmin = { role: "admin", universityId: "U1" };

test("restricted reports are superadmin-only; assigned admins see only their university", () => {
  assert.deepEqual(m.visibleFilter(superadmin), {});
  assert.deepEqual(m.visibleFilter(platformAdmin), { restrictedToSuperadmin: { $ne: true } });
  assert.deepEqual(m.visibleFilter(uniAdmin), { restrictedToSuperadmin: { $ne: true }, universityId: "U1" });
});

test("status filter defaults to open and rejects unknown values", () => {
  assert.deepEqual(m.statusFilter(undefined), { $in: ["open", "in_review", "escalated"] });
  assert.deepEqual(m.statusFilter("open"), { $in: ["open", "in_review", "escalated"] });
  assert.deepEqual(m.statusFilter("closed"), { $in: ["resolved", "dismissed"] });
  assert.equal(m.statusFilter("escalated"), "escalated");
  assert.equal(m.statusFilter("all"), null);
  assert.deepEqual(m.statusFilter("$ne"), { $in: ["open", "in_review", "escalated"] });
  assert.deepEqual(m.statusFilter({ $gt: "" }), { $in: ["open", "in_review", "escalated"] });
});

test("only a confirmed violation resolves; every other outcome dismisses", () => {
  assert.equal(m.statusForOutcome("violation_confirmed"), "resolved");
  for (const o of ["no_violation", "duplicate", "insufficient_info", "bad_faith"]) assert.equal(m.statusForOutcome(o), "dismissed");
});

test("closed reports cannot be closed again; escalated ones need a superadmin", () => {
  assert.equal(m.canClose(uniAdmin, { status: "open" }).ok, true);
  assert.equal(m.canClose(uniAdmin, { status: "in_review" }).ok, true);
  assert.equal(m.canClose(uniAdmin, { status: "resolved" }).reason, "already_closed");
  assert.equal(m.canClose(superadmin, { status: "dismissed" }).reason, "already_closed");
  assert.equal(m.canClose(uniAdmin, { status: "escalated" }).reason, "escalated_to_superadmin");
  assert.equal(m.canClose(superadmin, { status: "escalated" }).ok, true);
});
