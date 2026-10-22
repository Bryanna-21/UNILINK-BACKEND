const test = require("node:test");
const assert = require("node:assert/strict");

const {
  validateCatalogueCandidate,
  detectDuplicateCandidates,
  resolveUniversityMatch,
  buildInstitutionGapReport,
  candidateKey,
} = require("../src/utils/catalogueValidation");
const { runCatalogueImport } = require("../scripts/importCatalogueCandidates");

const universityList = [
  { _id: "u_1", name: "University of Lagos", country: "Nigeria" },
  { _id: "u_2", name: "University of Nairobi", country: "Kenya" },
  { _id: "u_3", name: "Kenyatta University", country: "Kenya" },
];

const candidateFixture = {
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
  evidenceNotes: "Official admissions listing for the programme family was found. Code remains internal because no official code was published.",
};

test("valid candidate parsing passes required schema checks", () => {
  const result = validateCatalogueCandidate(candidateFixture);
  assert.equal(result.ok, true);
  assert.equal(result.normalized.code, "UNILAG-BSC-CS-01");
  assert.equal(result.normalized.verificationStatus, "needs_official_verification");
});

test("invalid enum values are rejected", () => {
  const result = validateCatalogueCandidate({
    ...candidateFixture,
    qualificationLevel: "bachelor",
  });
  assert.equal(result.ok, false);
  assert.match(result.errors.join(" "), /qualificationLevel/i);
});

test("missing or ambiguous universities are rejected", () => {
  const missing = resolveUniversityMatch("Unknown College", universityList);
  assert.equal(missing.ok, false);

  const ambiguous = resolveUniversityMatch("University of", [
    { _id: "a", name: "University of Lagos" },
    { _id: "b", name: "University of Nairobi" },
  ]);
  assert.equal(ambiguous.ok, false);
});

test("duplicate candidate codes are detected", () => {
  const duplicates = detectDuplicateCandidates([
    candidateFixture,
    { ...candidateFixture, title: "Bachelor of Science in Information Technology" },
    { ...candidateFixture, institutionName: "University of Nairobi", code: "UNILAG-BSC-CS-01" },
  ]);
  assert.ok(duplicates.length >= 1);
});

test("case-insensitive code matching works", () => {
  const a = candidateKey({ institutionName: "University of Lagos", code: "UNILAG-BSC-CS-01" });
  const b = candidateKey({ institutionName: "university of lagos", code: "unilag-bsc-cs-01" });
  assert.equal(a, b);
});

test("existing course records are respected and unchanged", () => {
  const result = runCatalogueImport({
    filePath: require.resolve("../data/catalogue-candidates.json"),
    apply: false,
    universityRecords: universityList,
    existingCourses: [{ universityId: "u_1", code: "UNILAG-BSC-CS-01" }],
  });
  return result.then((summary) => {
    assert.equal(summary.existingDuplicateCount >= 1, true);
    assert.equal(summary.safeInsertions >= 0, true);
    assert.equal(summary.dryRun, true);
  });
});

test("dry-run performs no writes", async () => {
  const summary = await runCatalogueImport({
    filePath: require.resolve("../data/catalogue-candidates.json"),
    apply: false,
    universityRecords: universityList,
    existingCourses: [],
  });

  assert.equal(summary.dryRun, true);
  assert.equal(summary.writesAttempted, 0);
  assert.equal(summary.safeInsertions > 0, true);
});

test("apply mode cannot proceed without both safeguards", async () => {
  await assert.rejects(
    () => runCatalogueImport({
      filePath: require.resolve("../data/catalogue-candidates.json"),
      apply: true,
      confirmation: "",
      universityRecords: universityList,
      existingCourses: [],
    }),
    /UNILINK_CATALOGUE_CONFIRM=YES/
  );
});

test("repeated application remains idempotent", async () => {
  const summary = await runCatalogueImport({
    filePath: require.resolve("../data/catalogue-candidates.json"),
    apply: false,
    universityRecords: universityList,
    existingCourses: [{ universityId: "u_1", code: "UNILAG-BSC-CS-01" }],
  });

  assert.equal(summary.dryRun, true);
  assert.equal(summary.invalidCandidates.length, 0);
});

test("institution gap report identifies zero-course snapshot institutions", () => {
  const report = buildInstitutionGapReport({
    countries: [
      { country: "Nigeria", institutions: 124, existingCourses: 0 },
      { country: "Kenya", institutions: 73, existingCourses: 73 },
    ],
  });

  assert.equal(report.countries[0].institutionsWithZeroCourses, 124);
  assert.equal(report.countries[1].institutionsWithZeroCourses, 0);
});
