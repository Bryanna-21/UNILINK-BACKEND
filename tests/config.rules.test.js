const test = require("node:test");
const assert = require("node:assert/strict");
const { buildConfig, flag } = require("../src/utils/config.rules");

test("defaults: onboarding and enrolment on, calls and documents off", () => {
  const c = buildConfig({});
  assert.deepEqual(c.features, { onboarding: true, unitEnrolment: true, calls: false, documents: false });
  assert.equal(c.limits.maxUnits, 15);
});

test("switches parse the usual spellings, case-insensitively", () => {
  for (const off of ["false", "FALSE", "0", "off", "no", " No "]) assert.equal(flag(off, true), false, off);
  for (const on of ["true", "1", "on", "yes", "anything"]) assert.equal(flag(on, false), true, on);
  assert.equal(flag(undefined, true), true);
  assert.equal(flag("", false), false, "empty falls back to the default");
});

test("env overrides reach the config, and nothing but flags and limits is exposed", () => {
  const c = buildConfig({ FEATURE_ONBOARDING: "false", FEATURE_CALLS: "true", SECRET: "x", JWT_SECRET: "y" });
  assert.equal(c.features.onboarding, false);
  assert.equal(c.features.calls, true);
  assert.deepEqual(Object.keys(c).sort(), ["features", "limits", "version"]);
  assert.ok(!JSON.stringify(c).includes("SECRET"));
});
