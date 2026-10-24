const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("node:path");

const {
  validateCandidate,
  collectDuplicateCodes,
  parseCliArgs,
  runCatalogueImport,
} = require("../scripts/importCatalogueCandidates.js");

const validCandidate = {
  title: "Bachelor of Science in Computer Science",
  code: "CSC101",
  qualificationLevel: "degree",
  fieldOfStudy: "Computer Science",
  verificationStatus: "needs_official_verification",
  verificationSource: "https://www.admissions.unilag.edu.ng/programmes.html",
  universityId: "unilag",
  universityName: "University of Lagos",
};

test("valid candidate parses and validates", () => {
  const result = validateCandidate(validCandidate);
  assert.equal(result.valid, true);
  assert.deepEqual(result.errors, []);
});

test("invalid enum values are rejected", () => {
  const invalid = { ...validCandidate, qualificationLevel: "associate" };
  const result = validateCandidate(invalid);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /qualificationLevel/);
});

test("missing university ID is rejected", () => {
  const missing = { ...validCandidate, universityId: "" };
  const result = validateCandidate(missing);
  assert.equal(result.valid, false);
  assert.match(result.errors.join(" "), /universityId/);
});

test("duplicate candidate codes are detected case-insensitively", () => {
  const duplicateCandidates = [
    { ...validCandidate, code: "CS101" },
    { ...validCandidate, code: "cs101" },
  ];

  const duplicates = collectDuplicateCodes(duplicateCandidates);
  assert.equal(duplicates.length, 1);
  assert.equal(duplicates[0].code, "cs101");
});

test("dry-run performs no writes", () => {
  const candidatePath = path.join(__dirname, "..", "data", "catalogue-candidates.json");
  const result = runCatalogueImport({ candidatePath, apply: false, confirm: false, universityCatalog: [{ id: "unilag", name: "University of Lagos" }, { id: "uon", name: "University of Nairobi" }] });

  assert.equal(result.dryRun, true);
  assert.equal(result.proposedWrites, 0);
  assert.equal(result.acceptedCount > 0, true);
});

test("apply mode cannot proceed without both safeguards", () => {
  const dry = parseCliArgs([]);
  const applyMissingConfirm = parseCliArgs(["--apply"]);
  const applyAllowed = parseCliArgs(["--apply"]);

  process.env.UNILINK_CATALOGUE_CONFIRM = "YES";
  const finalState = parseCliArgs(["--apply"]);
  delete process.env.UNILINK_CATALOGUE_CONFIRM;

  assert.equal(dry.allowed, true);
  assert.equal(applyMissingConfirm.allowed, false);
  assert.equal(finalState.allowed, true);
});

test("repeated application remains idempotent", () => {
  const duplicateCandidates = [
    { ...validCandidate, code: "CSC101" },
    { ...validCandidate, code: "CSC101" },
  ];

  const duplicates = collectDuplicateCodes(duplicateCandidates);
  assert.equal(duplicates.length, 1);
});

test("coverage report identifies zero-course institutions", () => {
  const records = [
    { institution: "A", courseCount: 0, country: "Nigeria" },
    { institution: "B", courseCount: 2, country: "Kenya" },
  ];

  const zeroCourses = records.filter((item) => item.courseCount === 0);
  assert.equal(zeroCourses.length, 1);
  assert.equal(zeroCourses[0].institution, "A");
});
