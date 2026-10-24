"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { decideUniversityChange, isSetupFinished } = require("../src/utils/universityLock.rules");

const A = "a".repeat(24), B = "b".repeat(24);
const student = (extra = {}) => ({ role: "student", universityId: A, onboardingCompletedAt: null, programme: "", yearOfStudy: null, semester: null, ...extra });

test("a student mid-setup may switch university", () => {
  assert.deepEqual(decideUniversityChange(student(), B), { ok: true, change: true, value: B });
});
test("value is trimmed", () => {
  assert.equal(decideUniversityChange(student(), `  ${B} `).value, B);
});
test("resending the current university is a harmless no-op, even after setup", () => {
  assert.deepEqual(decideUniversityChange(student(), A), { ok: true, change: false });
  assert.deepEqual(decideUniversityChange(student({ onboardingCompletedAt: new Date() }), A), { ok: true, change: false });
});
test("after setup is complete the university is locked (403)", () => {
  const r = decideUniversityChange(student({ onboardingCompletedAt: new Date() }), B);
  assert.equal(r.ok, false); assert.equal(r.status, 403);
});
test("legacy accounts with programme, year and semester are locked too", () => {
  const r = decideUniversityChange(student({ programme: "BSc CS", yearOfStudy: 2, semester: 1 }), B);
  assert.equal(r.status, 403);
});
test("partial legacy data (no semester) is not yet locked", () => {
  assert.equal(decideUniversityChange(student({ programme: "BSc CS", yearOfStudy: 2 }), B).ok, true);
});
test("staff and superadmins can never change it here", () => {
  for (const role of ["lecturer", "admin", "superadmin", "weird"]) {
    const r = decideUniversityChange({ role, universityId: A }, B);
    assert.equal(r.ok, false, role); assert.equal(r.status, 403, role);
  }
});
test("staff may resend their own university unchanged", () => {
  assert.equal(decideUniversityChange({ role: "admin", universityId: A }, A).ok, true);
});
test("clearing is never allowed", () => {
  for (const v of ["", "   ", null]) {
    const r = decideUniversityChange(student(), v);
    assert.equal(r.ok, false); assert.equal(r.status, 400);
  }
});
test("non-text and malformed ids are rejected with 400", () => {
  for (const v of [123, {}, [], true, "not-an-id", "x".repeat(101), "$ne", "a".repeat(23)]) {
    const r = decideUniversityChange(student(), v);
    assert.equal(r.ok, false, String(v)); assert.equal(r.status, 400, String(v));
  }
});
test("missing user is refused, not thrown", () => {
  assert.equal(decideUniversityChange(null, B).status, 403);
});
test("a student with no university yet may set one", () => {
  assert.equal(decideUniversityChange(student({ universityId: undefined }), B).ok, true);
});
test("isSetupFinished matches the app's definition", () => {
  assert.equal(isSetupFinished(null), false);
  assert.equal(isSetupFinished({ onboardingCompletedAt: new Date() }), true);
  assert.equal(isSetupFinished({ programme: "x", yearOfStudy: 1, semester: 1 }), true);
  assert.equal(isSetupFinished({ programme: "x", yearOfStudy: 1 }), false);
});
