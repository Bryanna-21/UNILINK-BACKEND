"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createLegalCore } = require("../src/services/legal.core");

const U = "1".padStart(24, "0");
const content = (version) => ({ version, effectiveDate: "2026-10-24", title: "T", intro: "i", sections: [{ id: "a", number: 1, title: "A", blocks: [{ p: "{{CONTACT_EMAIL}}" }] }] });

function makeRepo() {
  const rows = [];
  let tick = 0;
  return {
    rows,
    users: new Map([[U, { _id: U }], ["2".padStart(24, "0"), { _id: "2".padStart(24, "0"), deletedAt: new Date() }]]),
    async userById(id) { return this.users.get(String(id)) || null; },
    async latestAcknowledgement(userId, type) { return rows.filter((r) => r.userId === String(userId) && r.policyType === type).sort((a, b) => b.createdAt - a.createdAt)[0] || null; },
    async createAcknowledgement(r) { const row = { ...r, userId: String(r.userId), createdAt: new Date(1700000000000 + ++tick * 1000) }; rows.push(row); return { version: row.version, createdAt: row.createdAt }; },
  };
}
const make = (version = "1.0", env = {}) => { const repo = makeRepo(); return { repo, core: createLegalCore({ repo, content: content(version), env }) }; };

test("the public notice is a draft and reports what the owner still has to supply", () => {
  const { core } = make("1.0", {});
  const r = core.getPrivacyNotice();
  assert.equal(r.ok, true);
  assert.equal(r.data.version, "1.0");
  assert.equal(r.data.reviewStatus, "draft");
  assert.equal(r.data.complete, false);
  assert.ok(r.data.openItems[0].includes("contact email"));
  assert.match(r.data.notice.sections[0].blocks[0].p, /^\[Owner to provide/);
});
test("a completed, reviewed notice says so", () => {
  const { core } = make("1.0", { LEGAL_CONTACT_EMAIL: "p@x.example", LEGAL_REVIEW_STATUS: "reviewed" });
  const r = core.getPrivacyNotice();
  assert.equal(r.data.complete, true);
  assert.equal(r.data.reviewStatus, "reviewed");
  assert.equal(r.data.notice.sections[0].blocks[0].p, "p@x.example");
});
test("a new person needs to acknowledge", async () => {
  const { core } = make();
  const r = await core.status(U);
  assert.deepEqual([r.data.needsAcknowledgement, r.data.acknowledgedVersion, r.data.currentVersion], [true, null, "1.0"]);
});
test("acknowledging records the version, then status says nothing more is needed", async () => {
  const { core, repo } = make();
  const a = await core.acknowledge(U, { policyType: "privacy", version: "1.0", source: "web" });
  assert.equal(a.ok, true);
  assert.equal(a.data.recorded, true);
  assert.deepEqual(repo.rows.map((r) => [r.userId, r.policyType, r.version, r.source]), [[U, "privacy", "1.0", "web"]]);
  const s = await core.status(U);
  assert.equal(s.data.needsAcknowledgement, false);
  assert.equal(s.data.acknowledgedVersion, "1.0");
  assert.ok(s.data.acknowledgedAt);
});
test("repeating the same version does not add another row", async () => {
  const { core, repo } = make();
  await core.acknowledge(U, { policyType: "privacy", version: "1.0", source: "web" });
  const again = await core.acknowledge(U, { policyType: "privacy", version: "1.0", source: "mobile" });
  assert.equal(again.ok, true);
  assert.equal(again.data.recorded, false);
  assert.equal(repo.rows.length, 1);
});
test("a stale or missing version is refused: nobody can acknowledge text they were not shown", async () => {
  const { core, repo } = make("2.0");
  for (const version of ["1.0", "", undefined, null, 2, "2.0 "]) {
    const r = await core.acknowledge(U, { policyType: "privacy", version, source: "web" });
    assert.equal(r.ok, false, String(version));
    assert.equal(r.status, 409);
    assert.equal(r.code, "NOTICE_OUT_OF_DATE");
  }
  assert.equal(repo.rows.length, 0);
});
test("an unknown notice type is refused", async () => {
  const { core } = make();
  for (const policyType of ["terms", "", undefined, "$ne"]) assert.equal((await core.acknowledge(U, { policyType, version: "1.0" })).status, 400, String(policyType));
});
test("when the notice moves to a new version, the person is asked again and both versions are kept", async () => {
  const repo = makeRepo();
  const v1 = createLegalCore({ repo, content: content("1.0"), env: {} });
  const v2 = createLegalCore({ repo, content: content("2.0"), env: {} });
  await v1.acknowledge(U, { policyType: "privacy", version: "1.0", source: "web" });
  assert.equal((await v2.status(U)).data.needsAcknowledgement, true);
  await v2.acknowledge(U, { policyType: "privacy", version: "2.0", source: "mobile" });
  assert.equal((await v2.status(U)).data.needsAcknowledgement, false);
  assert.deepEqual(repo.rows.map((r) => r.version), ["1.0", "2.0"]);
});
test("a deleted, unknown or missing account cannot acknowledge or read its status", async () => {
  const { core, repo } = make();
  for (const id of ["2".padStart(24, "0"), "9".padStart(24, "0"), undefined]) {
    assert.equal((await core.status(id)).status, 401);
    assert.equal((await core.acknowledge(id, { policyType: "privacy", version: "1.0" })).status, 401);
  }
  assert.equal(repo.rows.length, 0);
});
test("an unrecognised source is stored as unknown, not as whatever the client sent", async () => {
  const { core, repo } = make();
  await core.acknowledge(U, { policyType: "privacy", version: "1.0", source: "<script>alert(1)</script>" });
  assert.equal(repo.rows[0].source, "unknown");
});
