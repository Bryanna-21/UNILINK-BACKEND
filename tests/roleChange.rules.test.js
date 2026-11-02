"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { planRoleChange } = require("../src/utils/roleChange.rules");

const A = "a".repeat(24), B = "b".repeat(24);
const superadmin = { id: "sup", role: "superadmin", universityId: null };
const adminA = { id: "adm", role: "admin", universityId: A };
const platformAdmin = { id: "plat", role: "admin", universityId: null };
const person = (over = {}) => ({ id: "t1", role: "student", universityId: A, status: "active", isVerified: true, deletedAt: null, removedAt: null, ...over });
const plan = (o) => planRoleChange(o);

test("an admin can make a student in their university a lecturer", () => {
  const r = plan({ actor: adminA, target: person(), newRole: "lecturer" });
  assert.equal(r.ok, true);
  assert.deepEqual(r.set, { role: "lecturer" });
  assert.equal(r.from, "student");
  assert.equal(r.to, "lecturer");
});

test("the department is saved for a new lecturer, trimmed and capped", () => {
  const r = plan({ actor: adminA, target: person(), newRole: "lecturer", department: "  Computer Science  " });
  assert.equal(r.set.department, "Computer Science");
  assert.equal(plan({ actor: adminA, target: person(), newRole: "lecturer", department: "x".repeat(300) }).set.department.length, 100);
  assert.equal("department" in plan({ actor: adminA, target: person(), newRole: "lecturer", department: "   " }).set, false);
});

test("an admin can turn a lecturer back into a student", () => {
  const r = plan({ actor: adminA, target: person({ role: "lecturer" }), newRole: "student" });
  assert.equal(r.ok, true);
  assert.deepEqual(r.set, { role: "student" });
});

test("an admin can NOT make an admin, and can NOT touch an admin", () => {
  const up = plan({ actor: adminA, target: person(), newRole: "admin" });
  assert.equal(up.ok, false);
  assert.equal(up.status, 403);
  const down = plan({ actor: adminA, target: person({ role: "admin" }), newRole: "student" });
  assert.equal(down.ok, false);
  assert.equal(down.status, 403);
});

test("an admin cannot reach another university", () => {
  const r = plan({ actor: adminA, target: person({ universityId: B }), newRole: "lecturer" });
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
});

test("a person with no university is out of reach of a university admin", () => {
  const r = plan({ actor: adminA, target: person({ universityId: null }), newRole: "lecturer" });
  assert.equal(r.ok, false);
  assert.equal(r.status, 403);
});

test("a platform admin (no university) can change roles in any university", () => {
  assert.equal(plan({ actor: platformAdmin, target: person({ universityId: B }), newRole: "lecturer" }).ok, true);
});

test("the superadmin can make an admin, tied to the person's own university by default", () => {
  const r = plan({ actor: superadmin, target: person(), newRole: "admin" });
  assert.equal(r.ok, true);
  assert.deepEqual(r.set, { role: "admin", universityId: A });
});

test("the superadmin can name the university, or make the admin platform-wide only on purpose", () => {
  assert.deepEqual(plan({ actor: superadmin, target: person(), newRole: "admin", universityId: B }).set, { role: "admin", universityId: B });
  assert.deepEqual(plan({ actor: superadmin, target: person(), newRole: "admin", platformWide: true }).set, { role: "admin", universityId: null });
  // "true" as text, 1, or anything else is not an explicit yes
  assert.deepEqual(plan({ actor: superadmin, target: person(), newRole: "admin", platformWide: "true" }).set, { role: "admin", universityId: A });
});

test("an admin with nowhere to belong is refused until a choice is made", () => {
  const r = plan({ actor: superadmin, target: person({ universityId: null }), newRole: "admin" });
  assert.equal(r.ok, false);
  assert.equal(r.status, 400);
});

test("the superadmin can demote an admin, and a platform admin needs a university to land in", () => {
  assert.equal(plan({ actor: superadmin, target: person({ role: "admin" }), newRole: "lecturer" }).ok, true);
  const noUni = plan({ actor: superadmin, target: person({ role: "admin", universityId: null }), newRole: "student" });
  assert.equal(noUni.ok, false);
  assert.equal(noUni.status, 400);
  const withUni = plan({ actor: superadmin, target: person({ role: "admin", universityId: null }), newRole: "student", universityId: A });
  assert.deepEqual(withUni.set, { role: "student", universityId: A });
});

test("demoting never moves someone to another university", () => {
  const r = plan({ actor: superadmin, target: person({ role: "lecturer" }), newRole: "student", universityId: B });
  assert.deepEqual(r.set, { role: "student" });
});

test("nobody can change their own role, even the superadmin", () => {
  assert.equal(plan({ actor: superadmin, target: person({ id: "sup", role: "admin" }), newRole: "student" }).status, 403);
  assert.equal(plan({ actor: adminA, target: person({ id: "adm", role: "lecturer" }), newRole: "student" }).status, 403);
});

test("a superadmin cannot be changed, and nobody can be made one here", () => {
  assert.equal(plan({ actor: superadmin, target: person({ id: "other", role: "superadmin" }), newRole: "admin" }).status, 403);
  assert.equal(plan({ actor: adminA, target: person({ role: "superadmin" }), newRole: "student" }).status, 403);
  assert.equal(plan({ actor: superadmin, target: person(), newRole: "superadmin" }).status, 400);
});

test("students and lecturers cannot change roles", () => {
  for (const role of ["student", "lecturer", undefined]) {
    assert.equal(plan({ actor: { id: "x", role, universityId: A }, target: person(), newRole: "lecturer" }).status, 403);
  }
  assert.equal(plan({ actor: null, target: person(), newRole: "lecturer" }).status, 403);
});

test("a role that is not one of the three is refused", () => {
  for (const bad of ["owner", "", undefined, null, 5, "Admin", "root"]) {
    assert.equal(plan({ actor: superadmin, target: person(), newRole: bad }).status, 400, String(bad));
  }
});

test("promotion needs an active, verified account; demotion does not", () => {
  assert.equal(plan({ actor: adminA, target: person({ status: "suspended" }), newRole: "lecturer" }).status, 409);
  assert.equal(plan({ actor: adminA, target: person({ status: "terminated" }), newRole: "lecturer" }).status, 409);
  assert.equal(plan({ actor: adminA, target: person({ isVerified: false }), newRole: "lecturer" }).status, 409);
  assert.equal(plan({ actor: adminA, target: person({ role: "lecturer", status: "suspended" }), newRole: "student" }).ok, true);
});

test("removed and deleted accounts cannot be changed", () => {
  assert.equal(plan({ actor: superadmin, target: person({ removedAt: new Date() }), newRole: "lecturer" }).status, 409);
  assert.equal(plan({ actor: superadmin, target: person({ deletedAt: new Date() }), newRole: "lecturer" }).status, 404);
  assert.equal(plan({ actor: superadmin, target: null, newRole: "lecturer" }).status, 404);
});

test("changing to the role they already have is refused", () => {
  assert.equal(plan({ actor: adminA, target: person({ role: "lecturer" }), newRole: "lecturer" }).status, 409);
});
