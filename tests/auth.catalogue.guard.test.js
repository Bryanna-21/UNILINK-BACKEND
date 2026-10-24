"use strict";
// Source-level guards for auth.routes.js. These are NOT behavioural tests (the route needs a real database); they only
// stop the three changes below from being silently reverted. The behaviour behind them is tested elsewhere.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const src = fs.readFileSync(path.join(__dirname, "../src/routes/auth.routes.js"), "utf8");

test("login payload returns courseId", () => {
  assert.match(src, /courseId:\s*user\.courseId\s*\|\|\s*null/);
});
test("/auth/me selects courseId", () => {
  assert.match(src, /\.select\(\s*"name email role universityId campusId bio phone avatarUrl coverUrl username programme yearOfStudy semester onboardingCompletedAt courseId"/);
});
test("tokens use the configurable lifetime, not a fixed 24 hours", () => {
  assert.match(src, /expiresIn:\s*resolveJwtExpiry\(process\.env\.JWT_EXPIRES_IN\)/);
  assert.doesNotMatch(src, /expiresIn:\s*"24h"/);
});
