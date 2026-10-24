"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { groupUnits } = require("../src/utils/curriculum.rules");

const U = (code, name, y, s, extra = {}) => ({ _id: code, code, name, yearOfStudy: y, semester: s, ...extra });

test("groups by year then semester, in order, with readable labels", () => {
  const g = groupUnits([U("B2", "b", 2, 1), U("A1", "a", 1, 2), U("A0", "z", 1, 1), U("A2", "y", 1, 2)]);
  assert.deepEqual(g.map((x) => x.label), ["Year 1 · Semester 1", "Year 1 · Semester 2", "Year 2 · Semester 1"]);
  assert.deepEqual(g[1].units.map((u) => u.code), ["A1", "A2"]);
});
test("marks only the student's saved year and semester as current", () => {
  const g = groupUnits([U("A", "a", 1, 1), U("B", "b", 1, 2), U("C", "c", 2, 1)], { year: 1, semester: 2 });
  assert.deepEqual(g.map((x) => x.isCurrent), [false, true, false]);
});
test("no saved year or semester means nothing is marked current", () => {
  assert.equal(groupUnits([U("A", "a", 1, 1)], { year: null, semester: null })[0].isCurrent, false);
  assert.equal(groupUnits([U("A", "a", 1, 1)], { year: 1, semester: null })[0].isCurrent, false);
});
test("the same unit code in different placements stays separate", () => {
  const g = groupUnits([U("MAT1", "Calculus", 1, 1), U("MAT1", "Calculus", 2, 2)]);
  assert.equal(g.length, 2);
});
test("codes sort naturally and bad rows are skipped, empty input is safe", () => {
  const g = groupUnits([U("U10", "x", 1, 1), U("U2", "y", 1, 1), { code: "BAD", name: "no placement" }]);
  assert.deepEqual(g[0].units.map((u) => u.code), ["U2", "U10"]);
  assert.deepEqual(groupUnits(null), []);
  assert.deepEqual(groupUnits([]), []);
});
test("defaults verificationStatus to needs_verification", () => {
  assert.equal(groupUnits([U("A", "a", 1, 1)])[0].units[0].verificationStatus, "needs_verification");
});
