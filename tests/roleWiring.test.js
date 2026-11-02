"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");

test("role routes are mounted at /api/admin/roles", () => {
  assert.match(read("src/app.js"), /app\.use\("\/api\/admin\/roles", require\("\.\/routes\/roleAdmin\.routes"\)\)/);
});

test("the role routes sit behind login AND the admin guard, and search comes before :id", () => {
  const src = read("src/routes/roleAdmin.routes.js");
  assert.match(src, /router\.get\("\/users", auth, requireAdminOrSuperadmin/);
  assert.match(src, /router\.patch\("\/:id", auth, requireAdminOrSuperadmin/);
  assert.ok(src.indexOf('"/users"') < src.indexOf('"/:id"'));
});

test("the real controller loads and exports both handlers", () => {
  const c = require("../src/controllers/roleAdmin.controller");
  assert.equal(typeof c.searchUsers, "function");
  assert.equal(typeof c.changeRole, "function");
  require("../src/routes/roleAdmin.routes");
});
