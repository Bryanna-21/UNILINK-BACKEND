"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { summarise } = require("../src/utils/catalogueStats.rules");

const I = (id, name, type) => ({ _id: id, name, institutionType: type });
const C = (id, uni, code, title, extra = {}) => ({ _id: id, universityId: uni, code, title, ...extra });

test("an empty catalogue summarises to zeros with no problems", () => {
  const s = summarise({});
  assert.equal(s.institutions.total + s.courses.total + s.units.total, 0);
  assert.deepEqual(s.problems, []);
});
test("counts institutions by canonical type, untyped and legacy", () => {
  const s = summarise({ institutions: [I("1", "A", "university_public"), I("2", "B", null), I("3", "C", "technical_institute"), I("4", "D", "castle")] });
  assert.equal(s.institutions.untyped, 1);
  assert.equal(s.institutions.legacyTyped, 1);
  assert.deepEqual(s.institutions.byType, { university_public: 1, tvet_college: 1, "unrecognised:castle": 1 });
  assert.match(s.problems.join(" "), /1 institution\(s\) have no type/);
});
test("counts levels (reading the older qualificationLevel too), verification and units", () => {
  const s = summarise({
    institutions: [I("1", "A", "university_public")],
    courses: [C("c1", "1", "X", "One", { level: "degree", verificationStatus: "verified" }), C("c2", "1", "Y", "Two", { qualificationLevel: "diploma" }), C("c3", "1", "Z", "Three")],
    unitsByCourse: { c1: 10, c2: 5 },
  });
  assert.deepEqual(s.courses.byLevel, { degree: 1, diploma: 1 });
  assert.equal(s.courses.withoutLevel, 1);
  assert.equal(s.courses.verified, 1);
  assert.equal(s.courses.needsVerification, 2);
  assert.deepEqual([s.courses.withUnits, s.courses.withoutUnits, s.units.total], [2, 1, 15]);
});
test("flags orphaned courses and same-title duplicates, ignoring case and 'The'", () => {
  const s = summarise({
    institutions: [I("1", "Alpha College", "tvet_college")],
    courses: [C("c1", "1", "A1", "Diploma in Nursing"), C("c2", "1", "A2", "diploma in  nursing"), C("c3", "999", "B1", "Lost"), C("c4", "", "B2", "No uni")],
  });
  assert.equal(s.courses.orphaned, 2);
  assert.equal(s.courses.duplicateTitleGroups.length, 1);
  assert.deepEqual(s.courses.duplicateTitleGroups[0].codes, ["A1", "A2"]);
  assert.equal(s.courses.duplicateTitleGroups[0].institution, "Alpha College");
  assert.ok(s.problems.length >= 2);
});
test("reports duplicate unit groups handed in by the script", () => {
  assert.match(summarise({ unitDuplicateGroups: 3 }).problems.join(" "), /3 duplicated unit code/);
});
test("the same title at different institutions is not a duplicate", () => {
  const s = summarise({ institutions: [I("1", "A", null), I("2", "B", null)], courses: [C("c1", "1", "X", "Nursing"), C("c2", "2", "X", "Nursing")] });
  assert.equal(s.courses.duplicateTitleGroups.length, 0);
});
