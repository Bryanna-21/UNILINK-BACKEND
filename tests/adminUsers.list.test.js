"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

const stub = (rel, exports) => {
  const file = require.resolve(rel);
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};
const uni = "507f1f77bcf86cd799439011";
const other = "507f1f77bcf86cd799439012";
const everyone = [
  { _id: "s1", name: "Amina", email: "a@x", role: "student", status: "active", universityId: uni },
  { _id: "s2", name: "Brian", email: "b@x", role: "student", status: "active", universityId: other },
  { _id: "l1", name: "Cate", email: "c@x", role: "lecturer", status: "active", universityId: uni },
];
let lastQuery = null;
const chain = (rows) => ({ select: () => ({ sort: () => ({ skip: () => ({ limit: async () => rows }) }) }) });
stub("../src/models/User", {
  countDocuments: async () => 3,
  find: (query) => { lastQuery = query; return chain(everyone.filter((u) => !query.universityId || u.universityId === query.universityId)); },
});
for (const m of ["Unit", "AuditLog", "Notification", "Faculty", "Department", "Campus", "Announcement"]) stub(`../src/models/${m}`, {});
stub("../src/models/University", { find: () => ({ select: async () => [] }) });
const { listUsers } = require("../src/controllers/admin.controller");

const call = (user) => new Promise((resolve) => {
  const res = { json: (b) => resolve(b), status() { return this; } };
  listUsers({ query: {}, user }, res);
});

test("a university admin lists only their own university, with the roles they may assign", async () => {
  const body = await call({ id: "ad1", role: "admin", universityId: uni });
  assert.equal(lastQuery.universityId, uni);
  assert.deepEqual(body.data.map((u) => u.id), ["s1", "l1"]);
  const student = body.data.find((u) => u.id === "s1");
  const lecturer = body.data.find((u) => u.id === "l1");
  assert.deepEqual(student.assignableRoles, ["lecturer"]);
  assert.deepEqual(lecturer.assignableRoles, []);
});

test("a superadmin lists everyone and may assign more", async () => {
  const body = await call({ id: "sa", role: "superadmin" });
  assert.equal(lastQuery.universityId, undefined);
  assert.equal(body.data.length, 3);
  assert.deepEqual(body.data.find((u) => u.id === "s1").assignableRoles, ["lecturer", "admin"]);
  assert.deepEqual(body.data.find((u) => u.id === "l1").assignableRoles, ["student", "admin"]);
});
