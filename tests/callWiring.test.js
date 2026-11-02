"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");

test("call routes are mounted at /api/calls", () => {
  assert.match(read("src/app.js"), /app\.use\("\/api\/calls", require\("\.\/routes\/call\.routes"\)\)/);
});

test("every call route needs a login, fixed paths come before :id, and starting needs messaging allowed", () => {
  const src = read("src/routes/call.routes.js");
  for (const line of src.split("\n").filter((l) => /^router\.(get|post)/.test(l))) assert.match(line, /auth/, line);
  assert.ok(src.indexOf('"/incoming"') < src.indexOf('"/:id"'));
  assert.ok(src.indexOf('"/history"') < src.indexOf('"/:id"'));
  assert.match(src, /router\.post\("\/", auth, requireFeature\("messaging"\)/);
});

test("the real wiring loads without touching a database", () => {
  const calls = require("../src/services/call.instance");
  assert.equal(typeof calls.startCall, "function");
  require("../src/controllers/call.controller");
  require("../src/routes/call.routes");
});

test("the Call model has every status the service writes", () => {
  const Call = require("../src/models/Call");
  const allowed = Call.schema.path("status").enumValues;
  for (const s of ["ringing", "active", "ended", "missed", "declined", "cancelled"]) assert.ok(allowed.includes(s), s);
  assert.deepEqual(Call.schema.path("type").enumValues, ["voice", "video"]);
});

test("the HTTP layer turns a service result into a response and hides internal errors", async () => {
  const { handle } = require("../src/controllers/call.controller");
  const out = {};
  const res = { status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; } };
  await handle(async () => ({ status: 201, body: { status: "success" } }))({}, res);
  assert.equal(out.status, 201);
  const quiet = console.error; console.error = () => {};
  try { await handle(async () => { throw new Error("secret db password"); })({}, res); } finally { console.error = quiet; }
  assert.equal(out.status, 500);
  assert.ok(!JSON.stringify(out.body).includes("secret"));
});
