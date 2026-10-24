"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { seedMode } = require("../src/utils/seedGuard.rules");

test("the default is a dry run", () => {
  assert.deepEqual(seedMode([], {}), { mode: "dry-run", dryRun: true });
  assert.equal(seedMode([], { UNILINK_CATALOGUE_CONFIRM: "YES" }).dryRun, true, "confirm alone never writes");
});
test("--apply alone is blocked and says why", () => {
  const r = seedMode(["--apply"], {});
  assert.equal(r.mode, "blocked");
  assert.equal(r.dryRun, true);
  assert.match(r.message, /UNILINK_CATALOGUE_CONFIRM=YES/);
});
test("only the exact confirmation unlocks writing", () => {
  for (const bad of ["yes", "true", "1", "Y", " YES", ""]) {
    assert.equal(seedMode(["--apply"], { UNILINK_CATALOGUE_CONFIRM: bad }).dryRun, true, JSON.stringify(bad));
  }
  assert.deepEqual(seedMode(["--apply"], { UNILINK_CATALOGUE_CONFIRM: "YES" }), { mode: "apply", dryRun: false });
});
