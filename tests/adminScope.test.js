const test = require("node:test");
const assert = require("node:assert/strict");
const s = require("../src/utils/adminScope");

const superadmin = { role: "superadmin", universityId: null };
const platformAdmin = { role: "admin", universityId: null };
const uniAdmin = { role: "admin", universityId: "U1" };

test("superadmin and unassigned admins must choose a university; assigned admins are locked to theirs", () => {
  assert.deepEqual(s.resolveUniversity(superadmin, "U2"), { ok: true, universityId: "U2" });
  assert.equal(s.resolveUniversity(superadmin, "").ok, false);
  assert.equal(s.resolveUniversity(superadmin, s.GLOBAL).ok, false);
  assert.deepEqual(s.resolveUniversity(platformAdmin, "U9"), { ok: true, universityId: "U9" });
  assert.deepEqual(s.resolveUniversity(uniAdmin, ""), { ok: true, universityId: "U1" });
  assert.deepEqual(s.resolveUniversity(uniAdmin, "U1"), { ok: true, universityId: "U1" });
  const denied = s.resolveUniversity(uniAdmin, "U2");
  assert.equal(denied.ok, false);
  assert.equal(denied.status, 403);
});

test("scope filter and inScope agree", () => {
  assert.deepEqual(s.scopeFilter(superadmin), {});
  assert.deepEqual(s.scopeFilter(platformAdmin), {});
  assert.deepEqual(s.scopeFilter(uniAdmin), { universityId: "U1" });
  assert.equal(s.inScope(uniAdmin, "U1"), true);
  assert.equal(s.inScope(uniAdmin, "U2"), false);
  assert.equal(s.inScope(uniAdmin, null), false);
  assert.equal(s.inScope(superadmin, "anything"), true);
});

test("only unassigned actors may post UniLink-wide", () => {
  assert.equal(s.canPostGlobal(superadmin), true);
  assert.equal(s.canPostGlobal(platformAdmin), true);
  assert.equal(s.canPostGlobal(uniAdmin), false);
});

test("text, email and number helpers reject bad input", () => {
  assert.equal(s.cleanText("  hi  ", 10), "hi");
  for (const bad of ["", "   ", null, 5, "x".repeat(11)]) assert.equal(s.cleanText(bad, 10), null);
  assert.equal(s.isValidEmail("a@b.co"), true);
  for (const bad of ["a", "a@b", "a b@c.com", "", null, "a@b.c".padEnd(300, "x")]) assert.equal(s.isValidEmail(bad), false);
  assert.equal(s.clampInt("5000", 10, 1, 100), 100);
  assert.equal(s.clampInt("-3", 10, 1, 100), 1);
  assert.equal(s.clampInt("zz", 10, 1, 100), 10);
});

test("regex escaping neutralises metacharacters", () => {
  const re = new RegExp(s.escapeRegex("a.b(c)*"));
  assert.equal(re.test("a.b(c)*"), true);
  assert.equal(re.test("aXb(c)*"), false);
});
