"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { evaluateRoleChange, assignableRoles } = require("../src/utils/roleChange.rules");
const { createChangeUserRole } = require("../src/controllers/userRole.controller");

const uni = "507f1f77bcf86cd799439011";
const other = "507f1f77bcf86cd799439012";
const superadmin = { id: "sa", role: "superadmin", universityId: null };
const admin = { id: "ad1", role: "admin", universityId: uni };
const platformAdmin = { id: "ad2", role: "admin", universityId: null };
const person = (role, extra = {}) => ({ id: "t1", role, status: "active", universityId: uni, ...extra });
const check = (actor, target, newRole) => evaluateRoleChange({ actor, target, newRole });

test("an admin can make a student at their university a lecturer", () => {
  const v = check(admin, person("student"), "lecturer");
  assert.equal(v.ok, true);
  assert.deepEqual([v.from, v.to], ["student", "lecturer"]);
});

test("an admin can never make anyone an admin", () => {
  for (const role of ["student", "lecturer"]) {
    const v = check(admin, person(role), "admin");
    assert.equal(v.ok, false);
    assert.equal(v.code, "ADMIN_NEEDS_SUPERADMIN");
    assert.equal(v.status, 403);
  }
  assert.equal(check(platformAdmin, person("student"), "admin").ok, false);
});

test("an admin cannot touch another admin or a superadmin", () => {
  assert.equal(check(admin, person("admin"), "lecturer").code, "TARGET_ADMIN");
  assert.equal(check(admin, person("superadmin"), "lecturer").code, "TARGET_SUPERADMIN");
});

test("an admin cannot demote a lecturer", () => {
  assert.equal(check(admin, person("lecturer"), "student").code, "ADMIN_CANNOT_DEMOTE");
});

test("an admin stays inside their own university; a platform admin does not", () => {
  const away = person("student", { universityId: other });
  assert.equal(check(admin, away, "lecturer").code, "OTHER_UNIVERSITY");
  assert.equal(check(platformAdmin, away, "lecturer").ok, true);
  assert.equal(check(admin, person("student", { universityId: undefined }), "lecturer").code, "OTHER_UNIVERSITY");
});

test("a superadmin can make a student or lecturer an admin, and change anyone below superadmin", () => {
  assert.equal(check(superadmin, person("student"), "admin").ok, true);
  assert.equal(check(superadmin, person("lecturer"), "admin").ok, true);
  assert.equal(check(superadmin, person("student"), "lecturer").ok, true);
  assert.equal(check(superadmin, person("admin"), "lecturer").ok, true);
  assert.equal(check(superadmin, person("lecturer"), "student").ok, true);
  assert.equal(check(superadmin, person("student", { universityId: other }), "admin").ok, true);
});

test("nobody changes a superadmin or themselves", () => {
  assert.equal(check(superadmin, person("superadmin"), "admin").code, "TARGET_SUPERADMIN");
  assert.equal(check(superadmin, { ...person("student"), id: "sa" }, "admin").code, "SELF");
  assert.equal(check(admin, { ...person("student"), id: "ad1" }, "lecturer").code, "SELF");
});

test("the new role must be one we offer", () => {
  for (const role of ["superadmin", "root", "", undefined, null, 5, "Lecturer "]) {
    assert.equal(check(superadmin, person("student"), role).code, "BAD_ROLE", String(role));
  }
});

test("students, lecturers and missing actors cannot change roles at all", () => {
  assert.equal(check({ id: "x", role: "student" }, person("student"), "lecturer").code, "NOT_ALLOWED");
  assert.equal(check({ id: "x", role: "lecturer" }, person("student"), "lecturer").code, "NOT_ALLOWED");
  assert.equal(check(undefined, person("student"), "lecturer").code, "NOT_ALLOWED");
  assert.equal(check(superadmin, undefined, "lecturer").code, "NOT_FOUND");
});

test("only an active account can change role", () => {
  for (const extra of [{ status: "suspended" }, { status: "terminated" }, { deletedAt: new Date() }, { removedAt: new Date() }]) {
    assert.equal(check(superadmin, person("student", extra), "lecturer").code, "NOT_ACTIVE");
  }
});

test("making someone an admin or lecturer needs them to have a university", () => {
  const nobody = person("student", { universityId: "" });
  assert.equal(check(superadmin, nobody, "admin").code, "NEEDS_UNIVERSITY");
  assert.equal(check(superadmin, nobody, "lecturer").code, "NEEDS_UNIVERSITY");
  assert.equal(check(superadmin, nobody, "student").noop, true);
});

test("setting the role someone already has is a harmless no-op", () => {
  const v = check(admin, person("lecturer"), "lecturer");
  assert.equal(v.ok, true);
  assert.equal(v.noop, true);
});

test("assignableRoles offers only what would work", () => {
  assert.deepEqual(assignableRoles({ actor: admin, target: person("student") }), ["lecturer"]);
  assert.deepEqual(assignableRoles({ actor: admin, target: person("lecturer") }), []);
  assert.deepEqual(assignableRoles({ actor: admin, target: person("admin") }), []);
  assert.deepEqual(assignableRoles({ actor: superadmin, target: person("student") }), ["lecturer", "admin"]);
  assert.deepEqual(assignableRoles({ actor: superadmin, target: person("admin") }), ["student", "lecturer"]);
  assert.deepEqual(assignableRoles({ actor: superadmin, target: person("superadmin") }), []);
});

// ---- the handler, with the database replaced ----

const OID = "507f1f77bcf86cd799439021";
function setup({ actorDoc, targetDoc, race = false } = {}) {
  const logged = [];
  const sent = [];
  const actor = actorDoc || { _id: "sa", role: "superadmin", email: "boss@x.test" };
  const people = { [String(actor._id)]: actor, [OID]: targetDoc };
  const updates = [];
  const User = {
    findById: (id) => ({ select: async () => people[String(id)] || null }),
    findOneAndUpdate: (filter, update) => ({
      select: async () => {
        updates.push({ filter, update });
        if (race) return null;
        return { _id: OID, name: "Amina", role: update.$set.role };
      },
    }),
  };
  const AuditLog = { create: async (row) => { logged.push(row); } };
  const notify = async (n) => { sent.push(n); };
  const handler = createChangeUserRole({ User, AuditLog, notify, log: { error() {} } });
  const call = (body, { actorId = "sa", id = OID } = {}) =>
    new Promise((resolve) => {
      const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { resolve({ status: this.statusCode, body: b }); } };
      handler({ params: { id }, body, user: { id: actorId, email: "token@x.test" } }, res);
    });
  return { call, logged, sent, updates };
}
const student = { _id: OID, name: "Amina", email: "a@x.test", role: "student", status: "active", universityId: uni };

test("handler: a superadmin makes a student an admin, signs them out, tells them, and logs it", async () => {
  const { call, logged, sent, updates } = setup({ targetDoc: student });
  const r = await call({ role: "admin", reason: "Head of IT" });
  assert.equal(r.status, 200);
  assert.equal(r.body.data.role, "admin");
  assert.deepEqual(updates[0].filter, { _id: OID, role: "student" });
  assert.deepEqual(updates[0].update, { $set: { role: "admin" }, $inc: { tokenVersion: 1 } });
  assert.equal(logged[0].action, "USER_ROLE_CHANGE");
  assert.deepEqual(logged[0].previousState, { role: "student" });
  assert.deepEqual(logged[0].resultingState, { role: "admin" });
  assert.equal(logged[0].reason, "Head of IT");
  assert.deepEqual(sent[0].recipientIds, [OID]);
  assert.match(sent[0].title, /admin/);
});

test("handler: an admin cannot make an admin, and nothing is written", async () => {
  const { call, logged, sent, updates } = setup({ actorDoc: { _id: "ad1", role: "admin", universityId: uni }, targetDoc: student });
  const r = await call({ role: "admin" }, { actorId: "ad1" });
  assert.equal(r.status, 403);
  assert.equal(r.body.code, "ADMIN_NEEDS_SUPERADMIN");
  assert.equal(updates.length + logged.length + sent.length, 0);
});

test("handler: an admin makes a student at their own university a lecturer", async () => {
  const { call, updates } = setup({ actorDoc: { _id: "ad1", role: "admin", universityId: uni }, targetDoc: student });
  const r = await call({ role: "Lecturer" }, { actorId: "ad1" });
  assert.equal(r.status, 200);
  assert.equal(updates[0].update.$set.role, "lecturer");
});

test("handler: the role in the saved login is never trusted: the database decides", async () => {
  // The token says admin, the database says student: refused.
  const { call, updates } = setup({ actorDoc: { _id: "ad1", role: "student", universityId: uni }, targetDoc: student });
  const r = await call({ role: "lecturer" }, { actorId: "ad1" });
  assert.equal(r.status, 403);
  assert.equal(updates.length, 0);
});

test("handler: two people changing at once, the second is told to refresh", async () => {
  const { call, logged } = setup({ targetDoc: student, race: true });
  const r = await call({ role: "lecturer" });
  assert.equal(r.status, 409);
  assert.equal(r.body.code, "CHANGED");
  assert.equal(logged.length, 0);
});

test("handler: bad id, unknown person, same role", async () => {
  const { call } = setup({ targetDoc: student });
  assert.equal((await call({ role: "lecturer" }, { id: "nope" })).status, 400);
  assert.equal((await call({ role: "lecturer" }, { id: "507f1f77bcf86cd799439099" })).status, 404);
  const same = setup({ targetDoc: { ...student, role: "lecturer" } });
  const r = await same.call({ role: "lecturer" });
  assert.equal(r.status, 200);
  assert.equal(same.updates.length, 0);
});

test("handler: a failing audit write or notification never undoes the change", async () => {
  const logged = [];
  const handler = createChangeUserRole({
    User: {
      findById: (id) => ({ select: async () => (String(id) === "sa" ? { _id: "sa", role: "superadmin" } : student) }),
      findOneAndUpdate: () => ({ select: async () => ({ _id: OID, name: "Amina", role: "lecturer" }) }),
    },
    AuditLog: { create: async () => { throw new Error("audit down"); } },
    notify: async () => { throw new Error("push down"); },
    log: { error: (...a) => logged.push(a) },
  });
  const r = await new Promise((resolve) => {
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(b) { resolve({ status: this.statusCode, body: b }); } };
    handler({ params: { id: OID }, body: { role: "lecturer" }, user: { id: "sa" } }, res);
  });
  assert.equal(r.status, 200);
  assert.equal(logged.length, 1);
});
