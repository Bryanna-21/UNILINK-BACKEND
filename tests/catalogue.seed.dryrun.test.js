"use strict";
// A dry run must report what a real run would do. It used to count every unit as "to create" even when the course
// already had units, so a second dry run could never show "nothing left to do".
const test = require("node:test");
const assert = require("node:assert/strict");
const { createCatalogueCore } = require("../src/services/catalogue.core");

function repoWith({ existingUnitCodes }) {
  const writes = [];
  const w = (n) => (...a) => { writes.push(n); return undefined; };
  return {
    writes,
    async listInstitutions() { return [{ _id: "I1", name: "Kenya Medical Training College", institutionType: "medical_training" }]; },
    async listCourses() { return [{ _id: "C1", code: "DIP-NURS", title: "Diploma in Nursing (KRCHN)", level: "diploma", durationYears: 3, semestersPerYear: 2, verificationStatus: "needs_verification" }]; },
    async unitCodesOfCourse() { return existingUnitCodes; },
    createInstitution: w("createInstitution"), fillInstitutionType: w("fillInstitutionType"), createCourse: w("createCourse"),
    fillCourse: w("fillCourse"), insertUnits: w("insertUnits"),
  };
}
const args = {
  institutions: [{ name: "Kenya Medical Training College", institutionType: "medical_training" }],
  templates: [{ code: "DIP-NURS", title: "Diploma in Nursing (KRCHN)", level: "diploma", durationYears: 3, semestersPerYear: 2, appliesTo: { types: ["medical_training"] }, curriculum: "n" }],
  curricula: { n: [{ code: "N1", name: "Anatomy", yearOfStudy: 1, semester: 1 }] },
};

test("dry run: a course that already has units is skipped, not counted as 'to create'", async () => {
  const repo = repoWith({ existingUnitCodes: ["N1"] });
  const s = await createCatalogueCore({ repo }).seed({ ...args, dryRun: true });
  assert.equal(s.units.created, 0);
  assert.equal(s.units.coursesAlreadyHadUnits, 1);
  assert.deepEqual(repo.writes, []);
});
test("dry run: a course with no units still reports them, and still writes nothing", async () => {
  const repo = repoWith({ existingUnitCodes: [] });
  const s = await createCatalogueCore({ repo }).seed({ ...args, dryRun: true });
  assert.equal(s.units.created, 1);
  assert.deepEqual(repo.writes, []);
});
test("a real run and a dry run agree on the unit numbers", async () => {
  const a = await createCatalogueCore({ repo: repoWith({ existingUnitCodes: [] }) }).seed({ ...args, dryRun: true });
  const b = await createCatalogueCore({ repo: repoWith({ existingUnitCodes: [] }) }).seed({ ...args, dryRun: false });
  assert.deepEqual(a.units, b.units);
});
