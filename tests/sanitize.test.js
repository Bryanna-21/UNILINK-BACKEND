"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { findBadKey, rejectOperatorKeys } = require("../src/middleware/sanitize.middleware");

test("ordinary bodies pass, including nested data, arrays and dots or dollars inside VALUES", () => {
  assert.equal(findBadKey({ email: "a@b.co", password: "pa$$.word", list: [1, 2, { name: "x" }], nested: { deep: { ok: true } } }), null);
  assert.equal(findBadKey(null), null);
  assert.equal(findBadKey("text"), null);
  assert.equal(findBadKey([]), null);
});

test("a database operator is found wherever it hides", () => {
  assert.equal(findBadKey({ userId: { $ne: null } }), "userId.$ne");
  assert.equal(findBadKey({ a: { b: { c: { $gt: "" } } } }), "a.b.c.$gt");
  assert.equal(findBadKey({ list: [{ ok: 1 }, { $where: "1" }] }), "list[1].$where");
  assert.equal(findBadKey({ $or: [] }), "$or");
});

test("prototype-pollution keys are refused too", () => {
  assert.ok(findBadKey(JSON.parse('{"__proto__": {"admin": true}}')));
  assert.ok(findBadKey({ constructor: { prototype: { x: 1 } } }));
  assert.ok(findBadKey({ a: { prototype: 1 } }));
});

test("absurdly deep nesting is refused instead of walked forever", () => {
  let deep = { x: 1 };
  for (let i = 0; i < 40; i += 1) deep = { n: deep };
  assert.ok(findBadKey(deep));
});

function run(req) {
  const out = { status: null, body: null, nexted: false };
  const res = { status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; } };
  const warn = console.warn;
  console.warn = () => {};
  try { rejectOperatorKeys({ method: "POST", path: "/x", ip: "1.2.3.4", body: {}, query: {}, ...req }, res, () => { out.nexted = true; }); } finally { console.warn = warn; }
  return out;
}

test("the middleware lets a clean request through and answers 400 to an operator in the body or the query", () => {
  assert.equal(run({ body: { email: "a@b.co" } }).nexted, true);
  assert.equal(run({}).nexted, true);
  const body = run({ body: { userId: { $ne: null }, code: "123456" } });
  assert.equal(body.status, 400);
  assert.equal(body.nexted, false);
  assert.equal(run({ query: { q: { $regex: ".*" } } }).status, 400);
});
