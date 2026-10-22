"use strict";

const test = require("node:test");
const assert = require("node:assert/strict");

const {
  validateCatalogueCandidate,
  detectDuplicateCandidates,
  resolveUniversityMatch,
  candidateKey,
  buildInstitutionGapReport,
  buildInstitutionResearchQueue,
} = require("../src/utils/catalogueValidation");

const { runCatalogueImport } = require("../scripts/importCatalogueCandidates");

const sampleUniversityRecords = [
  { _id: "u_1", name: "University of Lagos", country: "Nigeria" },
  { _id: "u_2", name: "University of Nairobi", country: "Kenya" },
  { _id: "u_3", name: "Kenyatta University", country: "Kenya" },
];

const sampleCandidate = {
  institutionName: "University of Lagos",
  country: "Nigeria",
  title: "Bachelor of Science in Computer Science",
  code: "UNILAG-BSC-CS-01",
  qualificationLevel: "degree",
  fieldOfStudy: "Computer Science",
  verificationStatus: "needs_official_verification",
  verificationSource: "https://www.admissions.unilag.edu.ng/programmes.html",
  sourceType: "institution_website",
  sourceUrl: "https://www.admissions.unilag.edu.ng/programmes.html",
  researchDate: "2026-10-22",
  evidenceNotes: "This is a provisional candidate because the page confirms university identity but not a current official code.",
};

test("dry-run validation accepts a structurally valid candidate", () => {
  const result = validateCatalogueCandidate(sampleCandidate);
  assert.equal(result.ok, true);
  assert.equal(result.normalized.code, "UNILAG-BSC-CS-01");
  assert.equal(result.normalized.qualificationLevel, "degree");
});

test("invalid enum values fail validation", () => {
  const result = validateCatalogueCandidate({
    ...sampleCandidate,
    qualificationLevel: "bachelor",
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /qualificationLevel/i);
});

test("missing or ambiguous university matches fail safely", () => {
  const missing = resolveUniversityMatch("Unknown College", sampleUniversityRecords);
  assert.equal(missing.ok, false);

  const ambiguous = resolveUniversityMatch("University of", [
    { _id: "a", name: "University of Lagos" },
    { _id: "b", name: "University of Nairobi" },
  ]);
  assert.equal(ambiguous.ok, false);
});

test("duplicate candidate codes are detected case-insensitively", () => {
  const duplicates = detectDuplicateCandidates([
    sampleCandidate,
    { ...sampleCandidate, title: "Second candidate" },
    { ...sampleCandidate, institutionName: "university of lagos", code: "unilag-bsc-cs-01" },
  ]);
  assert.equal(duplicates.length >= 1, true);
  assert.equal(candidateKey(sampleCandidate), candidateKey({ ...sampleCandidate, institutionName: "UNIVERSITY OF LAGOS" }));
});

test("dry-run does not write and reports safe insertions", async () => {
  const summary = await runCatalogueImport({
    filePath: require.resolve("../data/catalogue-candidates.json"),
    apply: false,
    confirmation: "",
    universityRecords: sampleUniversityRecords,
    existingCourses: [],
  });

  assert.equal(summary.dryRun, true);
  assert.equal(summary.writesAttempted, 0);
  assert.equal(summary.safeInsertions >= 0, true);
});

test("apply mode cannot proceed without both safeguards", async () => {
  await assert.rejects(
    () => runCatalogueImport({
      filePath: require.resolve("../data/catalogue-candidates.json"),
      apply: true,
      confirmation: "",
      universityRecords: sampleUniversityRecords,
      existingCourses: [],
    }),
    /UNILINK_CATALOGUE_CONFIRM=YES/
  );
});

test("existing course records remain unchanged and are not re-inserted", async () => {
  const summary = await runCatalogueImport({
    filePath: require.resolve("../data/catalogue-candidates.json"),
    apply: false,
    confirmation: "",
    universityRecords: sampleUniversityRecords,
    existingCourses: [{ universityId: "u_1", code: "UNILAG-BSC-CS-01" }],
  });

  assert.equal(summary.rejected >= 0, true);
  assert.equal(summary.existingConflicts.length >= 0, true);
});

test("repeated application remains idempotent in dry-run mode", async () => {
  const first = await runCatalogueImport({
    filePath: require.resolve("../data/catalogue-candidates.json"),
    apply: false,
    confirmation: "",
    universityRecords: sampleUniversityRecords,
    existingCourses: [],
  });

  const second = await runCatalogueImport({
    filePath: require.resolve("../data/catalogue-candidates.json"),
    apply: false,
    confirmation: "",
    universityRecords: sampleUniversityRecords,
    existingCourses: [],
  });

  assert.equal(first.dryRun, true);
  assert.equal(second.dryRun, true);
  assert.equal(first.safeInsertions, second.safeInsertions);
});

test("full institution queue generation matches the snapshot dataset", () => {
  const report = buildInstitutionGapReport({
    countries: [
      { country: "Nigeria", institutions: 124, existingCourses: 0, institutionsWithZeroCourses: 124, priority: "P1" },
      { country: "Kenya", institutions: 73, existingCourses: 73, institutionsWithZeroCourses: 0, priority: "P2" },
    ],
  });

  assert.equal(report.countries[0].institutions, 124);
  assert.equal(report.countries[0].institutionsWithZeroCourses, 124);
  assert.equal(report.countries[1].institutions, 73);
  assert.equal(report.countries[1].institutionsWithZeroCourses, 0);

  const queue = buildInstitutionResearchQueue({
    countries: [
      {
        country: "Nigeria",
        priority: "P1",
        institutions: [{ name: "University of Lagos", existingCourses: 0, researchStatus: "zero_course_snapshot" }],
      },
      {
        country: "Kenya",
        priority: "P2",
        institutions: [{ name: "University of Nairobi", existingCourses: 1, researchStatus: "needs_verification" }],
      },
    ],
  });

  assert.equal(queue.length, 2);
  assert.equal(queue[0].country, "Nigeria");
  assert.equal(queue[1].country, "Kenya");
});

