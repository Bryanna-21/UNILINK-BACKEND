"use strict";
// Runs the REAL controller and service with only the repository's database calls faked.
const test = require("node:test");
const assert = require("node:assert/strict");
const repo = require("../src/services/legal.repo");
const ctrl = require("../src/controllers/legal.controller");
const { version } = require("../src/content/privacyNotice");

const U = "1".padStart(24, "0");
const mkRes = () => {
  const out = { code: 200, body: null, headers: {} };
  const r = { set(k, v) { out.headers[k] = v; return r; }, status(c) { out.code = c; return r; }, json(b) { out.body = b; return r; } };
  return { r, out };
};
function fake(rows) {
  const saved = { ...repo };
  repo.userById = async (id) => (String(id) === U ? { _id: U } : null);
  repo.latestAcknowledgement = async () => rows[rows.length - 1] || null;
  repo.createAcknowledgement = async (x) => { const row = { version: x.version, createdAt: new Date(), source: x.source }; rows.push(row); return row; };
  return () => Object.assign(repo, saved);
}

test("GET /privacy is public, cacheable, and returns the current version", () => {
  const { r, out } = mkRes();
  ctrl.getPrivacy({}, r);
  assert.equal(out.code, 200);
  assert.equal(out.body.data.version, version);
  assert.match(out.headers["Cache-Control"], /max-age/);
  assert.ok(out.body.data.notice.sections.length > 5);
});
test("POST /acknowledge records the current version, and the status endpoint then agrees", async () => {
  const rows = []; const restore = fake(rows);
  try {
    let { r, out } = mkRes();
    await ctrl.acknowledge({ user: { id: U }, body: { policyType: "privacy", version, source: "web" } }, r);
    assert.equal(out.code, 200);
    assert.equal(out.body.data.recorded, true);
    ({ r, out } = mkRes());
    await ctrl.getStatus({ user: { id: U } }, r);
    assert.equal(out.body.data.needsAcknowledgement, false);
  } finally { restore(); }
});
test("POST /acknowledge with an old version is a 409 with a code the clients can act on", async () => {
  const rows = []; const restore = fake(rows);
  try {
    const { r, out } = mkRes();
    await ctrl.acknowledge({ user: { id: U }, body: { policyType: "privacy", version: "0.1" } }, r);
    assert.equal(out.code, 409);
    assert.equal(out.body.code, "NOTICE_OUT_OF_DATE");
    assert.equal(rows.length, 0);
  } finally { restore(); }
});
test("a database failure is a 500 that does not leak details", async () => {
  const saved = repo.userById; repo.userById = async () => { throw new Error("mongo exploded at 10.0.0.5"); };
  try {
    const { r, out } = mkRes();
    await ctrl.getStatus({ user: { id: U } }, r);
    assert.equal(out.code, 500);
    assert.doesNotMatch(JSON.stringify(out.body), /mongo|10\.0\.0/);
  } finally { repo.userById = saved; }
});
test("a missing body does not crash the endpoint", async () => {
  const rows = []; const restore = fake(rows);
  try {
    const { r, out } = mkRes();
    await ctrl.acknowledge({ user: { id: U } }, r);
    assert.equal(out.code, 400);
  } finally { restore(); }
});
