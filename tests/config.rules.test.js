const test = require("node:test");
const assert = require("node:assert/strict");
const { buildConfig, flag, cleanVersion, cleanUrl } = require("../src/utils/config.rules");

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
  assert.deepEqual(Object.keys(c).sort(), ["app", "features", "limits", "version"]);
  assert.ok(!JSON.stringify(c).includes("SECRET"));
});

test("app update settings: unset means no prompt, valid values pass through", () => {
  assert.deepEqual(buildConfig({}).app, { latestVersion: null, minVersion: null, downloadUrl: null, message: null });
  const c = buildConfig({
    APP_LATEST_VERSION: " 0.2.0 ",
    APP_MIN_VERSION: "0.1",
    APP_DOWNLOAD_URL: "https://example.com/unilink.apk",
    APP_UPDATE_MESSAGE: " New emergency features ",
  });
  assert.deepEqual(c.app, {
    latestVersion: "0.2.0",
    minVersion: "0.1",
    downloadUrl: "https://example.com/unilink.apk",
    message: "New emergency features",
  });
});

test("app update settings: malformed versions and non-https links are dropped", () => {
  for (const bad of ["v1.0", "1.0.0-beta", "latest", "1..2", ""]) assert.equal(cleanVersion(bad), null, bad);
  for (const bad of ["http://example.com/a.apk", "javascript:alert(1)", "intent://x", "example.com/a.apk", "https://a b"]) {
    assert.equal(cleanUrl(bad), null, bad);
  }
  assert.equal(buildConfig({ APP_DOWNLOAD_URL: "http://example.com/a.apk" }).app.downloadUrl, null);
});

test("app update message is capped", () => {
  assert.equal(buildConfig({ APP_UPDATE_MESSAGE: "x".repeat(500) }).app.message.length, 200);
});
