"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const r = require("../src/utils/consolidation.rules");

const I = (id, name, extra = {}) => ({ _id: id, name, status: "active", ...extra });

test("campus names are read from KMTC campus records, and nothing else matches", () => {
  assert.equal(r.parseKmtcCampusName("Kenya Medical Training College - Nairobi Campus"), "Nairobi Campus");
  assert.equal(r.parseKmtcCampusName("Kenya Medical Training College - Bondo - Masita Satellite Campus"), "Bondo - Masita Satellite Campus");
  assert.equal(r.parseKmtcCampusName("kenya medical training college – Thika Campus"), "Thika Campus");
  for (const no of ["Kenya Medical Training College", "Kenya Medical Training College Nairobi", "Kenyatta University", "", null]) assert.equal(r.parseKmtcCampusName(no), null, String(no));
});
test("plan: every campus record is consolidated into the one KMTC institution", () => {
  const p = r.planKmtcConsolidation({ institutions: [I("k", "Kenya Medical Training College"), I("1", "Kenya Medical Training College - Nairobi Campus"), I("2", "Kenya Medical Training College - Thika Campus"), I("9", "Kenyatta University")] });
  assert.equal(p.ok, true);
  assert.deepEqual(p.canonical, { id: "k", name: "Kenya Medical Training College" });
  assert.deepEqual(p.counts, { total: 2, consolidate: 2, blocked: 0, alreadyInactive: 0 });
  assert.deepEqual(p.campuses.map((c) => c.campusName), ["Nairobi Campus", "Thika Campus"]);
});
test("plan: a record with students or enrolments is blocked, never moved", () => {
  const p = r.planKmtcConsolidation({
    institutions: [I("k", "Kenya Medical Training College"), I("1", "Kenya Medical Training College - A Campus"), I("2", "Kenya Medical Training College - B Campus"), I("3", "Kenya Medical Training College - C Campus")],
    studentsByUni: { 1: 2 }, enrolmentsByUni: { 2: 5 },
  });
  assert.deepEqual(p.campuses.map((c) => c.action), ["blocked", "blocked", "consolidate"]);
  assert.match(p.campuses[0].blockers[0], /2 student/);
  assert.match(p.campuses[1].blockers[0], /5 course enrolment/);
});
test("plan: already-inactive records are skipped, and repeated campus names are flagged", () => {
  const p = r.planKmtcConsolidation({ institutions: [I("k", "Kenya Medical Training College"), I("1", "Kenya Medical Training College - Mathare Campus", { status: "inactive" }), I("2", "Kenya Medical Training College - Mathare Campus")] });
  assert.equal(p.campuses[0].action, "already-inactive");
  assert.equal(p.campuses[1].duplicateOfCampus, "Mathare Campus");
});
test("plan: refuses when the single KMTC institution does not exist", () => {
  const p = r.planKmtcConsolidation({ institutions: [I("1", "Kenya Medical Training College - Nairobi Campus")] });
  assert.equal(p.ok, false);
  assert.match(p.reason, /seed first/);
});
test("plan: the KMTC institution itself is never planned for retirement", () => {
  const p = r.planKmtcConsolidation({ institutions: [I("k", "The Kenya Medical Training College"), I("1", "Kenya Medical Training College - Nairobi Campus")] });
  assert.equal(p.canonical.id, "k");
  assert.equal(p.campuses.length, 1);
});

// The real names from the live database
const REAL = ["Aberdare Teachers Training College", "Kericho Teachers College", "Kericho Teachers Training College", "Kigari Teachers Training College", "St Marks Kigari Teachers College",
  "Kilimambogo Teachers Training College", "St John Teachers Training College - Kilimambogo", "Thogoto Teachers College", "Thogoto Teachers Training College", "Mosoriot Teachers College",
  "Mosoriot Teachers Training College", "Shanzu Teachers College", "Shanzu Teachers Training College", "Garissa Teachers Training College", "Kenya Medical Training College - Garissa Campus", "Kenya Technical Trainers College"];
test("teacher colleges are recognised by name, medical and technical trainers are not", () => {
  assert.equal(r.isTeacherCollegeName("Kericho Teachers College"), true);
  assert.equal(r.isTeacherCollegeName("Moi Teachers College - Baringo"), true);
  assert.equal(r.isTeacherCollegeName("Kenya Medical Training College - Garissa Campus"), false);
  assert.equal(r.isTeacherCollegeName("Kenya Technical Trainers College"), false);
});
test("possible duplicates among the real names are found, and unrelated colleges are not paired", () => {
  const pairs = r.possibleDuplicateTeacherColleges(REAL.map((n, i) => I(String(i), n))).map((p) => p.slice().sort().join(" <> "));
  for (const expected of [["Kericho Teachers College", "Kericho Teachers Training College"], ["Thogoto Teachers College", "Thogoto Teachers Training College"],
    ["Mosoriot Teachers College", "Mosoriot Teachers Training College"], ["Shanzu Teachers College", "Shanzu Teachers Training College"],
    ["Kigari Teachers Training College", "St Marks Kigari Teachers College"], ["Kilimambogo Teachers Training College", "St John Teachers Training College - Kilimambogo"]]) {
    assert.ok(pairs.includes(expected.slice().sort().join(" <> ")), expected.join(" / "));
  }
  assert.ok(!pairs.some((p) => p.includes("Aberdare")), "Aberdare has no twin");
  assert.ok(!pairs.some((p) => p.includes("Garissa Teachers") && p.includes("Medical")), "a medical campus is not a teacher college");
});
test("only untyped teacher colleges are queued for typing", () => {
  const list = [I("1", "Kericho Teachers College"), I("2", "Thogoto Teachers College", { institutionType: "teacher_training" }), I("3", "Strathmore University"), I("4", "Seme Teachers College")];
  assert.deepEqual(r.teacherCollegesToType(list).map((i) => i.name), ["Kericho Teachers College", "Seme Teachers College"]);
});
