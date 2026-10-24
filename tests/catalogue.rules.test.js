"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const r = require("../src/utils/catalogue.rules");

test("titleKey ignores case, punctuation, ampersands and a leading 'the'", () => {
  assert.equal(r.titleKey("The Kabete National Polytechnic"), r.titleKey("kabete  national polytechnic"));
  assert.equal(r.titleKey("Arts & Science"), r.titleKey("arts and science"));
  assert.notEqual(r.titleKey("Diploma in Nursing"), r.titleKey("Certificate in Nursing"));
});
test("normalizeCode trims, collapses spaces and upper-cases", () => {
  assert.equal(r.normalizeCode("  bsc-it "), "BSC-IT");
  assert.equal(r.normalizeCode("bit   2103"), "BIT 2103");
});
test("parseLevel and parseInstitutionType accept only known values", () => {
  assert.equal(r.parseLevel("Higher Diploma"), "higher_diploma");
  assert.equal(r.parseLevel("degree"), "degree");
  assert.equal(r.parseLevel("masters"), null);
  assert.equal(r.parseInstitutionType("National polytechnic"), "national_polytechnic");
  assert.equal(r.parseInstitutionType("college"), null);
});
test("validateCourseInput: good course is cleaned", () => {
  const v = r.validateCourseInput({ code: " dip-nurs ", title: "  Diploma in Nursing  ", level: "Diploma", durationYears: "3" });
  assert.equal(v.ok, true);
  assert.deepEqual(v.value, { code: "DIP-NURS", title: "Diploma in Nursing", level: "diploma", durationYears: 3, semestersPerYear: 2, description: "" });
});
test("validateCourseInput rejects bad input", () => {
  for (const bad of [null, "x", {}, { code: "A", title: "T", level: "nope" }, { code: "", title: "T", level: "diploma" },
    { code: "A", title: "", level: "diploma" }, { code: "A", title: "T", level: "diploma", durationYears: 0 },
    { code: "A", title: "T", level: "diploma", durationYears: 9 }, { code: "A", title: "T", level: "diploma", semestersPerYear: 4 },
    { code: "x".repeat(41), title: "T", level: "diploma" }]) {
    assert.equal(r.validateCourseInput(bad).ok, false, JSON.stringify(bad));
  }
});
test("validateUnitInput: year and semester must fit the course", () => {
  const ok = r.validateUnitInput({ code: "x1", name: "N", yearOfStudy: 2, semester: 3, credits: 3 }, { durationYears: 3, semestersPerYear: 3 });
  assert.equal(ok.ok, true);
  assert.equal(ok.value.code, "X1");
  assert.equal(r.validateUnitInput({ code: "x1", name: "N", yearOfStudy: 4, semester: 1 }, { durationYears: 3, semestersPerYear: 2 }).ok, false);
  assert.equal(r.validateUnitInput({ code: "x1", name: "N", yearOfStudy: 1, semester: 3 }, { durationYears: 3, semestersPerYear: 2 }).ok, false);
  assert.equal(r.validateUnitInput({ code: "x1", name: "N", year: 1, semester: 1 }).ok, true, "accepts 'year' as an alias");
  assert.equal(r.validateUnitInput({ code: "x1", name: "N", yearOfStudy: 1 }).ok, false, "semester required");
  assert.equal(r.validateUnitInput({ code: "x1", name: "N", yearOfStudy: 1, semester: 1, credits: -1 }).ok, false);
  assert.equal(r.validateUnitInput({ code: "x1", name: "N", yearOfStudy: 1, semester: 1, credits: "abc" }).ok, false);
  assert.equal(r.validateUnitInput({ code: "x1", name: "N", yearOfStudy: 1, semester: 1 }).value.credits, null);
});
test("canSeeCatalogueCourse: staff everywhere, others only their institution", () => {
  const course = { universityId: "A" };
  assert.equal(r.canSeeCatalogueCourse({ viewer: { role: "admin" }, course }), true);
  assert.equal(r.canSeeCatalogueCourse({ viewer: { role: "superadmin" }, course }), true);
  assert.equal(r.canSeeCatalogueCourse({ viewer: { role: "student", universityId: "A" }, course }), true);
  assert.equal(r.canSeeCatalogueCourse({ viewer: { role: "student", universityId: "B" }, course }), false);
  assert.equal(r.canSeeCatalogueCourse({ viewer: { role: "student" }, course }), false);
  assert.equal(r.canSeeCatalogueCourse({ viewer: null, course }), false);
});
test("templateApplies matches by type or by exact name", () => {
  const t = { appliesTo: { types: ["medical_training"], names: ["Kenya Utalii College"] } };
  assert.equal(r.templateApplies(t, { name: "X", institutionType: "medical_training" }), true);
  assert.equal(r.templateApplies(t, { name: "The Kenya Utalii College", institutionType: "tvet_college" }), true);
  assert.equal(r.templateApplies(t, { name: "Y", institutionType: "tvet_college" }), false);
});

test("legacy institution types from an earlier session map onto the canonical types", () => {
  assert.equal(r.parseInstitutionType("technical_institute"), "tvet_college");
  assert.equal(r.parseInstitutionType("medical_training_college"), "medical_training");
  assert.equal(r.parseInstitutionType("Teacher Training College"), "teacher_training");
  assert.equal(r.parseInstitutionType("university"), null, "cannot tell public from private, so it is not guessed");
  assert.deepEqual(r.storedTypesFor("tvet_college"), ["tvet_college", "technical_institute"]);
  assert.deepEqual(r.storedTypesFor("university_public"), ["university_public"]);
});
test("only 'verified' reads as verified, whatever spelling an older record uses", () => {
  assert.equal(r.normalizeVerification("verified"), "verified");
  for (const v of ["needs_verification", "needs_client_verification", "needs_official_verification", undefined, null, ""]) {
    assert.equal(r.normalizeVerification(v), "needs_verification", String(v));
  }
});
