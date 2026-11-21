"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { logoutEverywhere } = require("../src/services/sessionService");
const { notifyPasswordChanged } = require("../src/services/securityNotice");
const { resolveJwtExpiryForRole } = require("../src/utils/tokenExpiry.rules");

test("signing out everywhere raises the account's token version by one, for that account only", async () => {
  const calls = [];
  const User = { updateOne: async (f, u) => { calls.push([f, u]); return { matchedCount: 1, modifiedCount: 1 }; } };
  const out = await logoutEverywhere({ User }, "64b0000000000000000000a1");
  assert.deepEqual(out, { ok: true });
  assert.deepEqual(calls[0], [{ _id: "64b0000000000000000000a1" }, { $inc: { tokenVersion: 1 } }]);
});

test("an account that does not exist is reported, not pretended", async () => {
  const User = { updateOne: async () => ({ matchedCount: 0, modifiedCount: 0 }) };
  assert.deepEqual(await logoutEverywhere({ User }, "64b0000000000000000000a2"), { ok: false });
});

test("the password-changed notice is addressed to the owner, says when, and says what to do if it was not them", async () => {
  const sent = [];
  const ok = await notifyPasswordChanged({ user: { email: "amina@uni.ac.ke", name: "Amina Wanjiru" }, send: async (...a) => sent.push(a), when: new Date("2026-11-14T10:00:00Z") });
  assert.equal(ok, true);
  const [to, subject, body] = sent[0];
  assert.equal(to, "amina@uni.ac.ke");
  assert.match(subject, /password was changed/i);
  assert.match(body, /Hello Amina/);
  assert.match(body, /14 Nov 2026/);
  assert.match(body, /Forgot password/);
  assert.match(body, /Sign out of all devices/);
});

test("a failure to send is logged and never thrown, and a user with no email gets nothing", async () => {
  const logged = [];
  const failed = await notifyPasswordChanged({ user: { email: "a@b.co" }, send: async () => { throw new Error("brevo down"); }, log: { error: (m) => logged.push(m) } });
  assert.equal(failed, false);
  assert.match(logged[0], /brevo down/);
  assert.equal(await notifyPasswordChanged({ user: { name: "No Email" }, send: async () => assert.fail("must not send") }), false);
  assert.equal(await notifyPasswordChanged({ user: null, send: async () => {} }), false);
});

test("staff sessions are capped at 7 days by default; students keep their configured lifetime", () => {
  assert.equal(resolveJwtExpiryForRole("student", undefined, undefined), "30d");
  assert.equal(resolveJwtExpiryForRole("lecturer", "60d", undefined), "60d");
  assert.equal(resolveJwtExpiryForRole("admin", undefined, undefined), "7d");
  assert.equal(resolveJwtExpiryForRole("superadmin", "60d", undefined), "7d");
});

test("staff can have a different cap, within 1 hour and 30 days, and never longer than the general setting", () => {
  assert.equal(resolveJwtExpiryForRole("admin", "30d", "12h"), "12h");
  assert.equal(resolveJwtExpiryForRole("admin", "30d", "14d"), "14d");
  assert.equal(resolveJwtExpiryForRole("admin", "2d", "14d"), "2d", "a shorter general lifetime still wins");
  assert.equal(resolveJwtExpiryForRole("admin", "30d", "90d"), "7d", "above 30 days is ignored");
  assert.equal(resolveJwtExpiryForRole("admin", "30d", "5m"), "7d", "below 1 hour is ignored");
  assert.equal(resolveJwtExpiryForRole("admin", "30d", "banana"), "7d");
});
