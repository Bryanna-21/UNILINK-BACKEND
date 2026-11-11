"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createAuth } = require("../src/middleware/auth.core");

process.env.JWT_SECRET = "test-secret";

const jwt = { verify: (token) => { if (token === "bad") throw new Error("bad"); const [id, v] = token.split(":"); return { id, tokenVersion: Number(v), role: "student" }; } };
function run(mw, token) {
  return new Promise((resolve) => {
    const req = { header: () => `Bearer ${token}` };
    const res = { statusCode: 200, status(c) { this.statusCode = c; return this; }, json(body) { resolve({ status: this.statusCode, body, nextCalled: false }); } };
    mw(req, res, () => resolve({ status: 200, body: null, nextCalled: true }));
  });
}
const quiet = (fn) => async (...a) => { const old = console.error; console.error = () => {}; try { return await fn(...a); } finally { console.error = old; } };

test("a database error is a 503 'try again', never 'Invalid token'", quiet(async () => {
  const User = { findById: () => ({ select: async () => { throw new Error("connection timed out"); } }) };
  const r = await run(createAuth({ jwt, User }), "u1:0");
  assert.equal(r.status, 503);
  assert.equal(r.body.code, "TEMPORARILY_UNAVAILABLE");
  assert.notEqual(r.body.message, "Invalid token");
  assert.equal(r.nextCalled, false);
}));

test("a database that throws before the query even runs is also a 503", quiet(async () => {
  const User = { findById: () => { throw new Error("buffering timed out"); } };
  assert.equal((await run(createAuth({ jwt, User }), "u1:0")).status, 503);
}));

test("a genuinely bad token is still 'Invalid token'", async () => {
  const User = { findById: () => ({ select: async () => ({ tokenVersion: 0 }) }) };
  const r = await run(createAuth({ jwt, User }), "bad");
  assert.equal(r.status, 401);
  assert.equal(r.body.message, "Invalid token");
});

test("a malformed id inside a signed token is a bad token, not an outage", quiet(async () => {
  const User = { findById: () => ({ select: async () => { const e = new Error("Cast to ObjectId failed"); e.name = "CastError"; throw e; } }) };
  const r = await run(createAuth({ jwt, User }), "nonsense:0");
  assert.equal(r.status, 401);
  assert.equal(r.body.message, "Invalid token");
}));

test("a changed password or removed account is still 'Session expired'", async () => {
  const User = { findById: () => ({ select: async () => ({ tokenVersion: 5 }) }) };
  const r = await run(createAuth({ jwt, User }), "u1:0");
  assert.equal(r.status, 401);
  assert.equal(r.body.message, "Session expired. Please login again.");
});

test("a healthy session still passes", async () => {
  const User = { findById: () => ({ select: async () => ({ tokenVersion: 0 }) }) };
  const r = await run(createAuth({ jwt, User }), "u1:0");
  assert.equal(r.nextCalled, true);
});
