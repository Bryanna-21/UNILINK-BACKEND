"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { resolveJwtExpiry, DEFAULT_EXPIRY } = require("../src/utils/tokenExpiry.rules");

test("default is 30 days, never the old 24 hours", () => {
  assert.equal(DEFAULT_EXPIRY, "30d");
  assert.equal(resolveJwtExpiry(undefined), "30d");
  assert.equal(resolveJwtExpiry(""), "30d");
  assert.equal(resolveJwtExpiry("   "), "30d");
});
test("sensible overrides are honoured", () => {
  assert.equal(resolveJwtExpiry("7d"), "7d");
  assert.equal(resolveJwtExpiry("12h"), "12h");
  assert.equal(resolveJwtExpiry("90d"), "90d");
  assert.equal(resolveJwtExpiry("86400"), "86400");
  assert.equal(resolveJwtExpiry(" 14 D "), "14d");
});
test("unreadable, too short or too long values fall back to the default", () => {
  for (const bad of ["forever", "-5d", "5m", "30s", "91d", "999999999", "1.5d", "d", "0"]) {
    assert.equal(resolveJwtExpiry(bad), "30d", bad);
  }
});
test("the result is accepted by jsonwebtoken", () => {
  const jwt = require("jsonwebtoken");
  for (const v of [undefined, "7d", "12h", "86400"]) {
    const token = jwt.sign({ id: "x" }, "secret", { expiresIn: resolveJwtExpiry(v) });
    assert.ok(jwt.verify(token, "secret").exp > jwt.verify(token, "secret").iat);
  }
});
