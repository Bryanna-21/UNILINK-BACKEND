"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createLimiter, rateLimit } = require("../src/middleware/rateLimit.middleware");

const clock = (start = 1000000) => { const c = { t: start, now: () => c.t, advance: (ms) => { c.t += ms; } }; return c; };

test("a caller gets exactly max requests in the window, then is refused with the wait time", () => {
  const c = clock();
  const l = createLimiter({ windowMs: 60000, max: 3, now: c.now });
  assert.equal(l.check("a").ok, true);
  assert.equal(l.check("a").ok, true);
  const third = l.check("a");
  assert.equal(third.ok, true);
  assert.equal(third.remaining, 0);
  c.advance(10000);
  const fourth = l.check("a");
  assert.equal(fourth.ok, false);
  assert.equal(fourth.retryAfterMs, 50000, "the oldest request leaves the window in 50 seconds");
});

test("the window slides: once old requests age out the caller can try again", () => {
  const c = clock();
  const l = createLimiter({ windowMs: 60000, max: 2, now: c.now });
  l.check("a"); l.check("a");
  assert.equal(l.check("a").ok, false);
  c.advance(60001);
  assert.equal(l.check("a").ok, true);
});

test("callers are counted separately", () => {
  const c = clock();
  const l = createLimiter({ windowMs: 60000, max: 1, now: c.now });
  assert.equal(l.check("a").ok, true);
  assert.equal(l.check("b").ok, true);
  assert.equal(l.check("a").ok, false);
});

test("a refused request does not extend the punishment", () => {
  const c = clock();
  const l = createLimiter({ windowMs: 60000, max: 1, now: c.now });
  l.check("a");
  for (let i = 0; i < 20; i += 1) { c.advance(1000); l.check("a"); }
  c.advance(41000);
  assert.equal(l.check("a").ok, true, "60s after the first request it is allowed again, however many it tried since");
});

test("sweep forgets callers with nothing recent, so memory cannot grow forever", () => {
  const c = clock();
  const l = createLimiter({ windowMs: 1000, max: 5, now: c.now });
  l.check("a"); l.check("b");
  assert.equal(l.size(), 2);
  c.advance(2000);
  l.sweep();
  assert.equal(l.size(), 0);
});

function fire(mw, req) {
  const out = { status: null, body: null, headers: {}, nexted: false };
  const res = { set(k, v) { out.headers[k] = v; return this; }, status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; } };
  const warn = console.warn;
  console.warn = () => {};
  try { mw({ ip: "1.1.1.1", method: "POST", path: "/login", body: {}, ...req }, res, () => { out.nexted = true; }); } finally { console.warn = warn; }
  return out;
}

test("the middleware answers 429 with Retry-After and a machine-readable code", () => {
  const c = clock();
  const mw = rateLimit({ name: "t1", windowMs: 60000, max: 2, keys: (r) => [r.ip], now: c.now });
  assert.equal(fire(mw, {}).nexted, true);
  assert.equal(fire(mw, {}).nexted, true);
  const blocked = fire(mw, {});
  assert.equal(blocked.status, 429);
  assert.equal(blocked.nexted, false);
  assert.equal(blocked.body.code, "RATE_LIMITED");
  assert.equal(blocked.headers["Retry-After"], "60");
  assert.equal(fire(mw, { ip: "2.2.2.2" }).nexted, true, "another caller is unaffected");
});

test("every key must pass: one account cannot be hammered from many addresses", () => {
  const c = clock();
  const mw = rateLimit({ name: "t2", windowMs: 60000, max: 2, keys: (r) => [`ip:${r.ip}`, `acct:${r.body.email}`], now: c.now });
  assert.equal(fire(mw, { ip: "1.1.1.1", body: { email: "v@x.co" } }).nexted, true);
  assert.equal(fire(mw, { ip: "2.2.2.2", body: { email: "v@x.co" } }).nexted, true);
  assert.equal(fire(mw, { ip: "3.3.3.3", body: { email: "v@x.co" } }).status, 429, "third address, same account");
  assert.equal(fire(mw, { ip: "3.3.3.3", body: { email: "other@x.co" } }).nexted, true);
});
