"use strict";
// The real app, the real routes and the real middleware, over real HTTP: the way an attacker would reach them.
// No database is connected, so a request that gets as far as a query would hang, which is the proof that the
// refusals below happen BEFORE any query.
process.env.JWT_SECRET = process.env.JWT_SECRET || "test-secret";
const test = require("node:test");
const assert = require("node:assert/strict");
const http = require("node:http");

const app = require("../src/app");
let server;
let base;
test.before(async () => {
  server = http.createServer(app);
  await new Promise((r) => server.listen(0, "127.0.0.1", r));
  base = `http://127.0.0.1:${server.address().port}`;
});
test.after(() => new Promise((r) => server.close(r)));

let n = 0;
const nextIp = () => `203.0.113.${(n += 1)}`;
// Each test attacks its own account id, because the limit is per account as well as per address.
let acct = 0;
const nextAcct = () => String((acct += 1)).padStart(24, "a");
async function post(path, body, ip = nextIp()) {
  const res = await fetch(`${base}${path}`, { method: "POST", headers: { "Content-Type": "application/json", "X-Forwarded-For": ip }, body: JSON.stringify(body), signal: AbortSignal.timeout(3000) });
  let json = null;
  try { json = await res.json(); } catch { /* not json */ }
  return { status: res.status, json, headers: res.headers };
}
const quiet = async (fn) => { const w = console.warn; const l = console.log; console.warn = () => {}; console.log = () => {}; try { return await fn(); } finally { console.warn = w; console.log = l; } };

test("THE ATTACK: verify-otp with an operator in place of the user id is refused before any query", async () => {
  const r = await quiet(() => post("/api/auth/verify-otp", { userId: { $ne: null }, code: "123456" }));
  assert.equal(r.status, 400);
  assert.equal(r.json.message, "Invalid request.");
});

test("THE ATTACK: the same through verify-login-otp, resend-otp, login, forgot-password, reset-password and register", async () => {
  const shapes = [
    ["/api/auth/verify-login-otp", { userId: { $gt: "" }, code: "123456" }],
    ["/api/auth/resend-otp", { userId: { $ne: null } }],
    ["/api/auth/login", { email: { $ne: null }, password: { $ne: null } }],
    ["/api/auth/forgot-password", { email: { $regex: ".*" } }],
    ["/api/auth/reset-password", { email: { $ne: null }, code: "123456", newPassword: "abcdefgh", confirmNewPassword: "abcdefgh" }],
    ["/api/auth/register", { name: "x", email: "a@b.co", password: "abcdefg", confirmPassword: "abcdefg", universityId: { $ne: null } }],
  ];
  for (const [path, body] of shapes) {
    const r = await quiet(() => post(path, body));
    assert.equal(r.status, 400, path);
  }
});

test("a code or id of the wrong shape is refused without a query, with the same wording as a wrong code", async () => {
  const r1 = await quiet(() => post("/api/auth/verify-otp", { userId: "not-an-id", code: "123456" }));
  assert.equal(r1.status, 400);
  assert.equal(r1.json.message, "Invalid or expired code");
  const r2 = await quiet(() => post("/api/auth/verify-otp", { userId: "64b0000000000000000000a1", code: "12" }));
  assert.equal(r2.status, 400);
  assert.equal(r2.json.message, "Invalid or expired code");
  const r3 = await quiet(() => post("/api/auth/verify-login-otp", { userId: "64b0000000000000000000a1", code: 123456 }));
  assert.equal(r3.status, 400);
});

test("email and password must be text", async () => {
  const r = await quiet(() => post("/api/auth/login", { email: ["a@b.co"], password: 12345 }));
  assert.equal(r.status, 400);
  assert.equal(r.json.message, "Invalid email or password");
});

test("one ACCOUNT cannot be guessed at from many addresses either", async () => {
  const victim = nextAcct();
  let status;
  for (let i = 0; i < 11; i += 1) status = (await quiet(() => post("/api/auth/verify-otp", { userId: victim, code: "12" }, nextIp()))).status;
  assert.equal(status, 429, "eleven attempts at one account, each from a different address");
});

test("code guessing is limited: the 11th attempt at one account is refused with 429 and Retry-After", async () => {
  const ip = nextIp();
  const body = { userId: nextAcct(), code: "12" }; // refused for its shape, which still counts as an attempt
  let last;
  for (let i = 0; i < 10; i += 1) last = await quiet(() => post("/api/auth/verify-otp", body, ip));
  assert.equal(last.status, 400, "the first ten are answered normally");
  const eleventh = await quiet(() => post("/api/auth/verify-otp", body, ip));
  assert.equal(eleventh.status, 429);
  assert.equal(eleventh.json.code, "RATE_LIMITED");
  assert.ok(Number(eleventh.headers.get("retry-after")) > 0);
});

test("a shared campus address is NOT locked out by normal use: 60 different students from one address all get answers", async () => {
  const campus = nextIp();
  let limited = 0;
  for (let i = 0; i < 60; i += 1) {
    const r = await quiet(() => post("/api/auth/verify-otp", { userId: nextAcct(), code: "12" }, campus));
    if (r.status === 429) limited += 1;
  }
  assert.equal(limited, 0);
});

test("a flood from one address is still stopped: past 200 requests in 15 minutes it is refused, other addresses are not", async () => {
  const flood = nextIp();
  let status = 0;
  for (let i = 0; i < 201; i += 1) status = (await quiet(() => post("/api/auth/verify-otp", { userId: nextAcct(), code: "12" }, flood))).status;
  assert.equal(status, 429);
  const other = await quiet(() => post("/api/auth/verify-otp", { userId: nextAcct(), code: "12" }, nextIp()));
  assert.equal(other.status, 400);
});

test("password guessing is limited per address", async () => {
  const ip = nextIp();
  let status;
  for (let i = 0; i < 11; i += 1) {
    const r = await quiet(() => post("/api/auth/login", { email: ["a"], password: "x" }, ip));
    status = r.status;
  }
  assert.equal(status, 429);
});

test("sending a code is limited: a fourth request for the same address in 15 minutes is refused", async () => {
  const ip = nextIp();
  let status;
  for (let i = 0; i < 4; i += 1) status = (await quiet(() => post("/api/auth/forgot-password", { email: ["x"] }, ip))).status;
  assert.equal(status, 429);
});

test("every response has the security headers, sign-in responses are not cacheable, and the server does not announce itself", async () => {
  const r = await quiet(() => post("/api/auth/login", { email: "a@b.co" }));
  assert.equal(r.headers.get("x-content-type-options"), "nosniff");
  assert.equal(r.headers.get("x-frame-options"), "DENY");
  assert.equal(r.headers.get("cache-control"), "no-store");
  assert.equal(r.headers.get("x-powered-by"), null);
});

test("an operator in a query string is refused on any route", async () => {
  const res = await quiet(() => fetch(`${base}/api/posts/feed?q[$ne]=x`, { headers: { "X-Forwarded-For": nextIp() }, signal: AbortSignal.timeout(3000) }));
  assert.equal(res.status, 400);
});
