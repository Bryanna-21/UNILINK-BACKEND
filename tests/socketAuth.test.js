"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { authenticateSocket, originAllowed, createEventGuard } = require("../src/services/socketAuth");

const SECRET = "a-test-secret-with-enough-different-characters-1234567890";
const ID = "64b0000000000000000000a1";
const token = (payload = {}, secret = SECRET, opts = {}) => jwt.sign({ id: ID, tokenVersion: 2, role: "student", ...payload }, secret, { expiresIn: "1h", ...opts });
const userModel = (doc) => ({ findById: () => ({ select: async () => doc }) });
const good = { tokenVersion: 2, status: "active" };
const run = (t, doc = good) => authenticateSocket({ token: t, jwt, User: userModel(doc), secret: SECRET });

test("a valid token for an account in good standing connects", async () => {
  const user = await run(token());
  assert.equal(user.id, ID);
});

test("no token, a wrongly signed token and an expired token are refused with the same plain message", async () => {
  for (const t of [undefined, "", 123, token({}, "other-secret"), token({}, SECRET, { expiresIn: "-1h" })]) {
    await assert.rejects(run(t), (e) => /Authentication required|Invalid or expired token/.test(e.safeMessage));
  }
});

test("a token signed with the 'none' algorithm is refused", async () => {
  const forged = Buffer.from(JSON.stringify({ alg: "none", typ: "JWT" })).toString("base64url") + "." + Buffer.from(JSON.stringify({ id: ID, tokenVersion: 2 })).toString("base64url") + ".";
  await assert.rejects(run(forged), (e) => e.safeMessage === "Invalid or expired token");
});

test("a token whose id is not a real id (an object, an operator, text) is refused before any lookup", async () => {
  const User = { findById: () => { throw new Error("must not look up"); } };
  for (const id of ["x", { $ne: null }, 5, ["a"]]) {
    await assert.rejects(authenticateSocket({ token: token({ id }), jwt, User, secret: SECRET }), (e) => e.safeMessage === "Invalid or expired token");
  }
});

test("a signed-out-everywhere token (old version) is refused", async () => {
  await assert.rejects(run(token({ tokenVersion: 1 }), { tokenVersion: 5, status: "active" }), (e) => e.safeMessage === "Session expired");
});

test("a deleted account is refused", async () => {
  await assert.rejects(run(token(), null), (e) => e.safeMessage === "Session expired");
});

test("a suspended account is refused", async () => {
  await assert.rejects(run(token(), { tokenVersion: 2, status: "suspended" }), (e) => e.safeMessage === "Account not available");
});

test("browsers are limited to the listed sites in production; apps (no Origin) always get in; development is open", () => {
  const prod = { NODE_ENV: "production", CORS_ORIGINS: "https://unilink.app, https://www.unilink.app" };
  assert.equal(originAllowed(undefined, prod), true);
  assert.equal(originAllowed("https://unilink.app", prod), true);
  assert.equal(originAllowed("https://www.unilink.app", prod), true);
  assert.equal(originAllowed("https://evil.example", prod), false);
  assert.equal(originAllowed("https://unilink.app.evil.example", prod), false);
  assert.equal(originAllowed("https://evil.example", { NODE_ENV: "development" }), true);
  assert.equal(originAllowed("https://x.example", { NODE_ENV: "production" }), false, "production with no list allows no browser");
});

test("a connection that sends more than the limit in the window is flagged, and recovers when the window passes", () => {
  let t = 0;
  const guard = createEventGuard({ max: 3, windowMs: 1000, now: () => t });
  assert.equal(guard(), true); assert.equal(guard(), true); assert.equal(guard(), true);
  assert.equal(guard(), false);
  t = 1500;
  assert.equal(guard(), true);
});
