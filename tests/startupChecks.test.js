"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { checkJwtSecret, assertSecureStartup, sha256, LEAKED_SECRET_FINGERPRINTS } = require("../src/utils/startupChecks");

const STRONG = "9f2c41d7a0b385e6c4d1f0a79b2e8c35d6a14f7e0b92c38d5a61f4e7b0c93a28";
const quiet = { warn: () => {}, error: () => {} };

test("a long random secret passes with no problems", () => {
  assert.deepEqual(checkJwtSecret(STRONG), { fatal: [], warnings: [] });
});

test("a missing or blank secret is fatal", () => {
  for (const bad of [undefined, null, "", "   ", 123]) assert.equal(checkJwtSecret(bad).fatal.length, 1, String(bad));
});

test("a secret that is known to be public is fatal, matched by fingerprint (the secret itself is never stored)", () => {
  const leaked = "pretend-this-was-committed";
  const fp = [sha256(leaked)];
  assert.equal(checkJwtSecret(leaked, fp).fatal.length, 1);
  assert.equal(checkJwtSecret(` ${leaked}\n`, fp).fatal.length, 1, "whitespace around it does not hide it");
  assert.equal(checkJwtSecret(STRONG, fp).fatal.length, 0);
  assert.ok(LEAKED_SECRET_FINGERPRINTS.every((h) => /^[a-f0-9]{64}$/.test(h)), "the built-in list holds only SHA-256 fingerprints");
});

test("a short or repetitive secret is a warning, not a crash", () => {
  const short = checkJwtSecret("abc123XYZ");
  assert.equal(short.fatal.length, 0);
  assert.match(short.warnings.join(" "), /only 9 characters/);
  assert.match(checkJwtSecret("a".repeat(40)).warnings.join(" "), /very few different characters/);
});

test("in production a fatal problem stops the server from starting", () => {
  assert.throws(() => assertSecureStartup({ NODE_ENV: "production" }, quiet), /Refusing to start: JWT_SECRET is not set/);
  const fp = [sha256("leaked-one")];
  assert.throws(() => assertSecureStartup({ NODE_ENV: "production", JWT_SECRET: "leaked-one" }, quiet, fp), /publicly|public repository/);
});

test("in production a weak-but-private secret only warns, so a weak setting cannot cause an outage", () => {
  const logs = [];
  const result = assertSecureStartup({ NODE_ENV: "production", JWT_SECRET: "short-but-private" }, { warn: (m) => logs.push(m), error() {} });
  assert.equal(result.ok, true);
  assert.equal(logs.length, 1);
});

test("outside production the same problems only warn, so local development still works", () => {
  const logs = [];
  const result = assertSecureStartup({ NODE_ENV: "development" }, { warn: (m) => logs.push(m), error() {} });
  assert.equal(result.ok, false);
  assert.match(logs.join(" "), /JWT_SECRET is not set/);
});

test("a healthy production setup starts quietly", () => {
  const logs = [];
  assert.deepEqual(assertSecureStartup({ NODE_ENV: "production", JWT_SECRET: STRONG }, { warn: (m) => logs.push(m), error() {} }), { ok: true, warnings: [] });
  assert.equal(logs.length, 0);
});
