"use strict";
// Sanity checks on the shipped starter data, so a typo in a data file fails here and not during the seed.
const test = require("node:test");
const assert = require("node:assert/strict");
const rules = require("../src/utils/catalogue.rules");
const institutions = require("../src/data/catalogue/institutions");
const templates = require("../src/data/catalogue/courseTemplates");
const curricula = require("../src/data/catalogue/curricula");

test("every institution has a known type and a unique name", () => {
  const seen = new Set();
  for (const i of institutions) {
    assert.ok(rules.INSTITUTION_TYPES.includes(i.institutionType), `${i.name}: ${i.institutionType}`);
    const k = rules.titleKey(i.name);
    assert.ok(!seen.has(k), `duplicate institution: ${i.name}`);
    seen.add(k);
  }
});
test("every institution type in the brief is represented", () => {
  for (const type of rules.INSTITUTION_TYPES) assert.ok(institutions.some((i) => i.institutionType === type), type);
  assert.ok(institutions.length >= 100);
});
test("template codes and titles are unique and valid", () => {
  const codes = new Set(), titles = new Set();
  for (const t of templates) {
    const v = rules.validateCourseInput(t);
    assert.equal(v.ok, true, `${t.code}: ${v.message}`);
    assert.ok(!codes.has(v.value.code), `duplicate code ${t.code}`);
    assert.ok(!titles.has(rules.titleKey(t.title)), `duplicate title ${t.title}`);
    codes.add(v.value.code); titles.add(rules.titleKey(t.title));
    assert.ok(t.appliesTo && ((t.appliesTo.types || []).length || (t.appliesTo.names || []).length), `${t.code} applies to nothing`);
    for (const type of t.appliesTo.types || []) assert.ok(rules.INSTITUTION_TYPES.includes(type), `${t.code}: type ${type}`);
  }
});
test("every level in the brief is covered: certificate, diploma, higher diploma, degree", () => {
  for (const level of ["certificate", "diploma", "higher_diploma", "degree"]) assert.ok(templates.some((t) => t.level === level), level);
});
test("diploma and nursing courses are present for medical training colleges", () => {
  const kmtc = institutions.find((i) => i.name === "Kenya Medical Training College");
  assert.equal(kmtc.institutionType, "medical_training");
  const forKmtc = templates.filter((t) => rules.templateApplies(t, kmtc));
  assert.ok(forKmtc.some((t) => t.code === "DIP-NURS" && t.level === "diploma"));
  assert.ok(forKmtc.some((t) => t.code === "DIP-CM"));
  assert.ok(forKmtc.some((t) => t.level === "higher_diploma"));
  assert.ok(templates.some((t) => t.code === "BSc-NURS" && t.level === "degree"));
});
test("every template that names an institution matches one in the list", () => {
  for (const t of templates) {
    for (const n of t.appliesTo.names || []) {
      assert.ok(institutions.some((i) => rules.titleKey(i.name) === rules.titleKey(n)), `${t.code}: unknown institution ${n}`);
    }
  }
});
test("every curriculum fits its course and has unique unit codes", () => {
  for (const t of templates.filter((x) => x.curriculum)) {
    const units = curricula[t.curriculum];
    assert.ok(units && units.length, `${t.code}: missing curriculum ${t.curriculum}`);
    const seen = new Set();
    for (const u of units) {
      const v = rules.validateUnitInput(u, { durationYears: t.durationYears, semestersPerYear: t.semestersPerYear });
      assert.equal(v.ok, true, `${t.curriculum}: ${v.message}`);
      assert.ok(!seen.has(v.value.code), `${t.curriculum}: duplicate unit ${u.code}`);
      seen.add(v.value.code);
    }
    // every year and semester of the course has at least one unit (the structure is complete, even if illustrative)
    for (let y = 1; y <= t.durationYears; y++) for (let s = 1; s <= t.semestersPerYear; s++) {
      assert.ok(units.some((u) => u.yearOfStudy === y && u.semester === s), `${t.curriculum}: nothing in Year ${y} Semester ${s}`);
    }
  }
  for (const key of Object.keys(curricula)) assert.ok(templates.some((t) => t.curriculum === key), `unused curriculum ${key}`);
});
test("the BSc IT example from the brief is in place", () => {
  const y1 = curricula["bsc-it"].filter((u) => u.yearOfStudy === 1 && u.semester === 1).map((u) => u.name);
  for (const n of ["Programming Fundamentals", "Computer Systems", "Mathematics for Computing"]) assert.ok(y1.includes(n), n);
  const y1s2 = curricula["bsc-it"].filter((u) => u.yearOfStudy === 1 && u.semester === 2).map((u) => u.name);
  for (const n of ["Data Structures", "Database Systems"]) assert.ok(y1s2.includes(n), n);
});
test("the data files never claim anything is verified", () => {
  for (const t of templates) assert.equal(t.verificationStatus, undefined);
  for (const i of institutions) assert.equal(i.verified, undefined);
});
