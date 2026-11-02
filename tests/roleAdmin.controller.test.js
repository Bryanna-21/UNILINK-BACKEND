"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createRoleAdmin } = require("../src/controllers/roleAdmin.controller");

const hex = (n) => String(n).padStart(24, "0");
const UNI_A = hex(101), UNI_B = hex(102), GHOST = hex(999);
const isValidId = (v) => /^[0-9a-f]{24}$/i.test(String(v));

const chain = (v) => {
  const o = { select: () => o, sort: () => o, limit: () => o, lean: () => o, then: (res, rej) => Promise.resolve(v).then(res, rej) };
  return o;
};
const res = () => {
  const out = { status: 200, body: null };
  return { out, status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; } };
};

function build({ users = {}, matched = 1 } = {}) {
  const calls = { find: null, update: null, audit: [] };
  const api = createRoleAdmin({
    User: {
      findById: (id) => chain(users[id] ? { _id: id, ...users[id] } : null),
      find: (f) => { calls.find = f; return chain(Object.entries(users).map(([id, u]) => ({ _id: id, ...u }))); },
      updateOne: async (filter, op) => { calls.update = { filter, op }; return { matchedCount: matched }; },
    },
    University: { exists: async (f) => (String(f._id) === UNI_A || String(f._id) === UNI_B ? { _id: f._id } : null) },
    writeAudit: async (req, entry) => { calls.audit.push(entry); },
    isValidId,
  });
  return { api, calls };
}

const SUPER = hex(1), ADMIN_A = hex(2), STUDENT = hex(3), LECT = hex(4), OTHER_B = hex(5);
const base = () => ({
  [SUPER]: { role: "superadmin", status: "active", universityId: null, name: "Root" },
  [ADMIN_A]: { role: "admin", status: "active", universityId: UNI_A, name: "Admin A" },
  [STUDENT]: { role: "student", status: "active", universityId: UNI_A, isVerified: true, name: "Amina" },
  [LECT]: { role: "lecturer", status: "active", universityId: UNI_A, isVerified: true, name: "Dr Otieno" },
  [OTHER_B]: { role: "student", status: "active", universityId: UNI_B, isVerified: true, name: "Brian" },
});
const change = async (api, actorId, targetId, body) => {
  const r = res();
  await api.changeRole({ user: { id: actorId, role: "admin" }, params: { id: targetId }, body }, r);
  return r.out;
};

test("an admin makes a student a lecturer: updated, signed out everywhere, audited", async () => {
  const { api, calls } = build({ users: base() });
  const out = await change(api, ADMIN_A, STUDENT, { role: "lecturer", department: "Computer Science" });
  assert.equal(out.status, 200);
  assert.deepEqual(calls.update.filter, { _id: STUDENT, role: "student", deletedAt: null, removedAt: null });
  assert.deepEqual(calls.update.op.$set, { role: "lecturer", department: "Computer Science" });
  assert.deepEqual(calls.update.op.$inc, { tokenVersion: 1 }, "the old token must stop working");
  assert.equal(calls.audit.length, 1);
  assert.equal(calls.audit[0].action, "change_role");
  assert.equal(calls.audit[0].details, "student -> lecturer");
  assert.equal(out.body.data.role, "lecturer");
  assert.match(out.body.message, /signed out/);
});

test("an admin trying to make an admin is refused and nothing is written", async () => {
  const { api, calls } = build({ users: base() });
  const out = await change(api, ADMIN_A, STUDENT, { role: "admin" });
  assert.equal(out.status, 403);
  assert.equal(calls.update, null);
  assert.equal(calls.audit.length, 0);
});

test("an admin cannot reach a student of another university", async () => {
  const { api, calls } = build({ users: base() });
  const out = await change(api, ADMIN_A, OTHER_B, { role: "lecturer" });
  assert.equal(out.status, 403);
  assert.equal(calls.update, null);
});

test("the superadmin makes an admin; the admin stays tied to the person's university", async () => {
  const { api, calls } = build({ users: base() });
  const out = await change(api, SUPER, STUDENT, { role: "admin" });
  assert.equal(out.status, 200);
  assert.deepEqual(calls.update.op.$set, { role: "admin", universityId: UNI_A });
});

test("the superadmin makes a platform-wide admin only when asked explicitly", async () => {
  const { api, calls } = build({ users: base() });
  await change(api, SUPER, STUDENT, { role: "admin", platformWide: true });
  assert.deepEqual(calls.update.op.$set, { role: "admin", universityId: null });
  assert.match(calls.audit[0].details, /platform-wide/);
});

test("a university that does not exist is refused", async () => {
  const { api, calls } = build({ users: base() });
  const out = await change(api, SUPER, STUDENT, { role: "admin", universityId: GHOST });
  assert.equal(out.status, 400);
  assert.equal(calls.update, null);
});

test("a malformed university or user id is refused", async () => {
  const { api } = build({ users: base() });
  assert.equal((await change(api, SUPER, STUDENT, { role: "admin", universityId: "nope" })).status, 400);
  assert.equal((await change(api, SUPER, "not-an-id", { role: "admin" })).status, 400);
});

test("the caller's role comes from the database, not the token: a demoted admin's old token does nothing", async () => {
  const users = base();
  users[ADMIN_A].role = "student"; // demoted since the token was issued
  const { api, calls } = build({ users });
  const r = res();
  await api.changeRole({ user: { id: ADMIN_A, role: "admin" }, params: { id: STUDENT }, body: { role: "lecturer" } }, r);
  assert.equal(r.out.status, 403);
  assert.equal(calls.update, null);
});

test("a suspended admin cannot change roles", async () => {
  const users = base();
  users[ADMIN_A].status = "suspended";
  const { api, calls } = build({ users });
  assert.equal((await change(api, ADMIN_A, STUDENT, { role: "lecturer" })).status, 403);
  assert.equal(calls.update, null);
});

test("nobody can change their own role", async () => {
  const { api, calls } = build({ users: base() });
  assert.equal((await change(api, SUPER, SUPER, { role: "student" })).status, 403);
  assert.equal(calls.update, null);
});

test("an unknown user is a 404", async () => {
  const { api } = build({ users: base() });
  assert.equal((await change(api, SUPER, hex(777), { role: "lecturer" })).status, 404);
});

test("if the account changed while the admin was working, the write is refused with 409 and not audited", async () => {
  const { api, calls } = build({ users: base(), matched: 0 });
  const out = await change(api, ADMIN_A, STUDENT, { role: "lecturer" });
  assert.equal(out.status, 409);
  assert.equal(calls.audit.length, 0);
});

test("a database error is a clean 500, never a crash", async () => {
  const api = createRoleAdmin({
    User: { findById: () => { throw new Error("db down"); } },
    University: { exists: async () => null },
    writeAudit: async () => {},
    isValidId,
  });
  const quiet = console.error; console.error = () => {};
  try {
    const r = res();
    await api.changeRole({ user: { id: SUPER }, params: { id: STUDENT }, body: { role: "lecturer" } }, r);
    assert.equal(r.out.status, 500);
  } finally { console.error = quiet; }
});

// ---- search ----
const search = async (api, actorId, query) => {
  const r = res();
  await api.searchUsers({ user: { id: actorId }, query }, r);
  return r.out;
};

test("search: needs a name of 2+ letters or a role, so the whole user base is never dumped", async () => {
  const { api } = build({ users: base() });
  assert.equal((await search(api, SUPER, {})).status, 400);
  assert.equal((await search(api, SUPER, { q: "a" })).status, 400);
  assert.equal((await search(api, SUPER, { q: "am" })).status, 200);
  assert.equal((await search(api, SUPER, { role: "lecturer" })).status, 200);
});

test("search: an admin is limited to their university and to students and lecturers", async () => {
  const { api, calls } = build({ users: base() });
  await search(api, ADMIN_A, { q: "am" });
  assert.equal(calls.find.universityId, UNI_A);
  assert.deepEqual(calls.find.role, { $in: ["student", "lecturer"] });
  assert.equal(calls.find.deletedAt, null);
  assert.equal(calls.find.removedAt, null);
});

test("search: the superadmin sees every university and the admins too, but never other superadmins", async () => {
  const { api, calls } = build({ users: base() });
  await search(api, SUPER, { q: "am" });
  assert.equal("universityId" in calls.find, false);
  assert.deepEqual(calls.find.role, { $in: ["student", "lecturer", "admin"] });
});

test("search: an admin asking for admins gets nothing, not an error", async () => {
  const { api } = build({ users: base() });
  const out = await search(api, ADMIN_A, { role: "admin" });
  assert.equal(out.status, 200);
  assert.equal(out.body.count, 0);
});

test("search: the text is matched safely, so a regex in the box cannot break or slow the query", async () => {
  const { api, calls } = build({ users: base() });
  await search(api, SUPER, { q: ".*(a+)+$" });
  const rx = calls.find.$or[0].name;
  assert.ok(rx instanceof RegExp);
  assert.equal(rx.test("Amina Otieno"), false, "the text is literal, not a pattern");
  assert.equal(rx.test("x.*(a+)+$y"), true);
});

test("search: students and lecturers are refused, and no password or token field is ever returned", async () => {
  const users = base();
  users[STUDENT].password = "secret-hash";
  users[STUDENT].pushToken = "ExponentPushToken[x]";
  const { api } = build({ users });
  assert.equal((await search(api, STUDENT, { q: "am" })).status, 403);
  const ok = await search(api, SUPER, { q: "am" });
  const text = JSON.stringify(ok.body);
  assert.ok(!text.includes("secret-hash") && !text.includes("ExponentPushToken"));
  assert.deepEqual(Object.keys(ok.body.data[0]).sort(), ["department", "email", "id", "isVerified", "name", "role", "status", "universityId", "username"]);
});
