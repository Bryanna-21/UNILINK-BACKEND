"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { securityHeaders, scrubServerErrors, GENERIC_5XX } = require("../src/middleware/security.middleware");

function res(status = 200) {
  const out = { statusCode: status, headers: {}, sent: null };
  out.set = (h, v) => { if (typeof h === "string") out.headers[h] = v; else Object.assign(out.headers, h); return out; };
  out.json = (b) => { out.sent = b; return out; };
  return out;
}

test("every response carries the hardening headers", () => {
  const r = res();
  securityHeaders({ path: "/api/posts" }, r, () => {});
  assert.equal(r.headers["X-Content-Type-Options"], "nosniff");
  assert.equal(r.headers["X-Frame-Options"], "DENY");
  assert.equal(r.headers["Referrer-Policy"], "no-referrer");
  assert.match(r.headers["Strict-Transport-Security"], /max-age=\d+/);
  assert.match(r.headers["Content-Security-Policy"], /default-src 'none'/);
  assert.equal(r.headers["Cache-Control"], undefined, "ordinary routes are not forced uncached");
});

test("sign-in responses are never cached", () => {
  const r = res();
  securityHeaders({ path: "/api/auth/login" }, r, () => {});
  assert.equal(r.headers["Cache-Control"], "no-store");
});

test("a server error's internal message is logged and replaced for the caller", () => {
  const r = res(500);
  const logged = [];
  const old = console.error;
  console.error = (m) => logged.push(m);
  try {
    scrubServerErrors({ method: "GET", originalUrl: "/api/posts" }, r, () => {});
    r.json({ status: "error", message: "Error fetching posts: MongoServerError: connection <10.0.0.5:27017> refused" });
  } finally { console.error = old; }
  assert.equal(r.sent.message, GENERIC_5XX);
  assert.equal(r.sent.status, "error");
  assert.match(logged[0], /\[500\] GET \/api\/posts: Error fetching posts: MongoServerError/);
});

test("503 'try again' style errors are scrubbed the same way, and other fields are kept", () => {
  const r = res(503);
  const old = console.error; console.error = () => {};
  try { scrubServerErrors({ method: "GET", originalUrl: "/x" }, r, () => {}); r.json({ status: "error", code: "DB_DOWN", message: "mongo exploded at 10.0.0.5" }); } finally { console.error = old; }
  assert.equal(r.sent.code, "DB_DOWN");
  assert.equal(r.sent.message, GENERIC_5XX);
});

test("a deliberate 4xx message is left exactly as written", () => {
  for (const code of [400, 401, 403, 404, 409, 429]) {
    const r = res(code);
    scrubServerErrors({ method: "POST", originalUrl: "/x" }, r, () => {});
    r.json({ status: "error", message: "Invalid or expired code" });
    assert.equal(r.sent.message, "Invalid or expired code", String(code));
  }
});

test("successful responses, and bodies with no message, pass through untouched", () => {
  const ok = res(200);
  scrubServerErrors({ method: "GET", originalUrl: "/x" }, ok, () => {});
  const body = { status: "success", data: [1, 2], message: "fine" };
  ok.json(body);
  assert.equal(ok.sent, body);
  const noMessage = res(500);
  scrubServerErrors({ method: "GET", originalUrl: "/x" }, noMessage, () => {});
  noMessage.json({ status: "error" });
  assert.deepEqual(noMessage.sent, { status: "error" });
});
