"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createAuth } = require("../src/middleware/auth.core");

process.env.JWT_SECRET = "test-secret";
const NOW = new Date("2026-10-05T12:00:00Z");
const hours = (h) => new Date(NOW.getTime() + h * 3600 * 1000);

// A fake jsonwebtoken: tokens are just "id:version".
const jwt = { verify: (token) => { if (token === "bad") throw new Error("bad"); const [id, v] = token.split(":"); return { id, tokenVersion: Number(v), role: "student" }; } };
function setup(users, opts = {}) {
  const User = { findById: (id) => ({ select: async () => users[id] || null }) };
  const auth = createAuth({ jwt, User, now: () => NOW, ...opts });
  return auth;
}
function run(mw, token) {
  return new Promise((resolve) => {
    const req = { header: () => (token === undefined ? undefined : `Bearer ${token}`) };
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(body) { resolve({ status: this.statusCode, body, req, nextCalled: false }); } };
    mw(req, res, () => resolve({ status: 200, body: null, req, nextCalled: true }));
  });
}

test("a normal active user passes, and gets their restrictions attached", async () => {
  const auth = setup({ u1: { tokenVersion: 0, status: "active", restrictions: [{ feature: "posting", until: null }] } });
  const r = await run(auth, "u1:0");
  assert.equal(r.nextCalled, true);
  assert.equal(r.req.user.id, "u1");
  assert.deepEqual(r.req.account.restrictions.map((x) => x.feature), ["posting"]);
});

test("legacy users with no status field still pass", async () => {
  const r = await run(setup({ u1: { tokenVersion: 0 } }), "u1:0");
  assert.equal(r.nextCalled, true);
});

test("missing token, bad token, stale tokenVersion and unknown user are all 401", async () => {
  const auth = setup({ u1: { tokenVersion: 3, status: "active" } });
  assert.equal((await run(auth, undefined)).status, 401);
  assert.equal((await run(auth, "bad")).status, 401);
  assert.equal((await run(auth, "u1:2")).status, 401, "old session after a password change or deletion");
  assert.equal((await run(auth, "ghost:0")).status, 401);
});

test("a suspended user is blocked with a 403 and a machine-readable code", async () => {
  const auth = setup({ u1: { tokenVersion: 0, status: "suspended", suspendedUntil: hours(48) } });
  const r = await run(auth, "u1:0");
  assert.equal(r.nextCalled, false);
  assert.equal(r.status, 403);
  assert.equal(r.body.code, "ACCOUNT_SUSPENDED");
  assert.equal(r.body.appealable, true);
  assert.equal(r.body.until, hours(48).toISOString());
});

test("an admin's old open-ended suspension is now real", async () => {
  const r = await run(setup({ u1: { tokenVersion: 0, status: "suspended" } }), "u1:0");
  assert.equal(r.status, 403);
  assert.equal(r.body.until, null);
});

test("a temporary suspension lifts by itself when its time is up", async () => {
  const r = await run(setup({ u1: { tokenVersion: 0, status: "suspended", suspendedUntil: hours(-1) } }), "u1:0");
  assert.equal(r.nextCalled, true);
});

test("terminated accounts are blocked", async () => {
  const r = await run(setup({ u1: { tokenVersion: 0, status: "terminated" } }), "u1:0");
  assert.equal(r.status, 403);
  assert.equal(r.body.code, "ACCOUNT_TERMINATED");
});

test("allowRestricted lets suspended and terminated accounts reach appeals, and says so", async () => {
  const auth = setup({ s: { tokenVersion: 0, status: "suspended" }, t: { tokenVersion: 0, status: "terminated" } });
  for (const id of ["s", "t"]) {
    const r = await run(auth.allowRestricted, `${id}:0`);
    assert.equal(r.nextCalled, true, id);
    assert.ok(r.req.account.block, "the route can see WHY they are restricted");
  }
});

test("allowRestricted does NOT bypass authentication itself", async () => {
  const auth = setup({ u1: { tokenVersion: 3, status: "suspended" } });
  assert.equal((await run(auth.allowRestricted, undefined)).status, 401);
  assert.equal((await run(auth.allowRestricted, "bad")).status, 401);
  assert.equal((await run(auth.allowRestricted, "u1:2")).status, 401);
});

test("the kill switch turns status enforcement off without touching anything else", async () => {
  const users = { u1: { tokenVersion: 0, status: "suspended" } };
  const off = setup(users, { enforce: () => false });
  assert.equal((await run(off, "u1:0")).nextCalled, true);
  assert.equal((await run(off, "u1:9")).status, 401, "authentication itself is still enforced");
  const prev = process.env.MODERATION_ENFORCE_STATUS;
  process.env.MODERATION_ENFORCE_STATUS = "false";
  assert.equal((await run(createAuth({ jwt, User: { findById: () => ({ select: async () => users.u1 }) }, now: () => NOW }), "u1:0")).nextCalled, true);
  process.env.MODERATION_ENFORCE_STATUS = prev === undefined ? "" : prev;
  if (prev === undefined) delete process.env.MODERATION_ENFORCE_STATUS;
});

test("the exported value is still a plain function with a .allowRestricted variant", () => {
  const auth = setup({});
  assert.equal(typeof auth, "function");
  assert.equal(typeof auth.allowRestricted, "function");
  assert.equal(auth.length, 3, "(req, res, next): same signature every route already uses");
});
