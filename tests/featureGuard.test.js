"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { requireFeature, featureBlock } = require("../src/middleware/featureGuard");

const NOW = new Date("2026-10-19T12:00:00Z");
const future = new Date(NOW.getTime() + 86400000);
const past = new Date(NOW.getTime() - 86400000);

function run(feature, restrictions) {
  let nextCalled = false, status = null, body = null;
  const res = { status(c) { status = c; return this; }, json(b) { body = b; return this; } };
  requireFeature(feature, { now: () => NOW })({ account: restrictions === undefined ? undefined : { restrictions } }, res, () => { nextCalled = true; });
  return { nextCalled, status, body };
}

test("a person with no restriction passes", () => {
  assert.equal(run("messaging", []).nextCalled, true);
  assert.equal(run("messaging", undefined).nextCalled, true);
});

test("a restriction on that feature blocks it with a clear code and the end date", () => {
  const r = run("messaging", [{ feature: "messaging", until: future }]);
  assert.equal(r.nextCalled, false);
  assert.equal(r.status, 403);
  assert.equal(r.body.code, "FEATURE_RESTRICTED");
  assert.equal(r.body.feature, "messaging");
  assert.equal(r.body.until, future.toISOString());
  assert.match(r.body.message, /send messages/);
});

test("a restriction on a different feature does not block this one", () => {
  assert.equal(run("posting", [{ feature: "messaging", until: future }]).nextCalled, true);
});

test("a restriction that has ended no longer blocks; one with no end date blocks until lifted", () => {
  assert.equal(run("messaging", [{ feature: "messaging", until: past }]).nextCalled, true);
  assert.equal(run("messaging", [{ feature: "messaging", until: null }]).nextCalled, false);
});

test("featureBlock returns the matching restriction", () => {
  const hit = featureBlock([{ feature: "posting", until: future }], "posting", NOW);
  assert.equal(hit.feature, "posting");
  assert.equal(featureBlock([], "posting", NOW), null);
});
