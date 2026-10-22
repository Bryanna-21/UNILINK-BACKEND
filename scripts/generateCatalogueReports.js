"use strict";

const fs = require("fs");
const path = require("path");

const {
  validateCatalogueCandidate,
  detectDuplicateCandidates,
  resolveUniversityMatch,
  candidateKey,
} = require("../src/utils/catalogueValidation");

function parseArgs(argv) {
  const options = {
    apply: false,
    file: path.join(__dirname, "..", "data", "catalogue-candidates.json"),
  };

  for (let i = 0; i < argv.length; i += 1) {
    const current = argv[i];

    if (current === "--apply") {
      options.apply = true;
      continue;
    }

    if (current === "--file") {
      options.file = path.resolve(argv[i + 1] || options.file);
      i += 1;
      continue;
    }
  }

  return options;
}

function readCandidateFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const json = JSON.parse(raw);
  if (!Array.isArray(json)) {
    if (json && Array.isArray(json.candidates)) {
      return json.candidates;
    }
    throw new Error("Catalogue candidate file must contain an array or a { candidates: [...] } object.");
  }
  return json;
}

async function runCatalogueImport({
  filePath,
  apply = false,
  confirmation = "",
  universityRecords = [],
  existingCourses = [],
} = {}) {
  const resolvedFilePath = filePath || path.join(__dirname, "..", "data", "catalogue-candidates.json");
  const candidates = readCandidateFile(resolvedFilePath);

  const seenByKey = new Map();
  const validCandidates = [];
  const invalidCandidates = [];

  for (const candidate of candidates) {
    const validated = validateCatalogueCandidate(candidate);

    if (!validated.ok) {
      invalidCandidates.push({ candidate, errors: validated.errors });
      continue;
    }

    const key = candidateKey(validated.normalized);
    if (seenByKey.has(key)) {
      invalidCandidates.push({ candidate, errors: [`duplicate code detected within the candidate file for ${validated.normalized.institutionName}`] });
      continue;
    }

    seenByKey.set(key, true);
    validCandidates.push(validated.normalized);
  }

  const duplicateCandidates = detectDuplicateCandidates(validCandidates);
  duplicateCandidates.forEach((duplicate) => {
    invalidCandidates.push({ candidate: duplicate.candidate, errors: duplicate.errors });
  });

  const resolved = [];
  for (const candidate of validCandidates) {
    const match = resolveUniversityMatch(candidate.institutionName || candidate.universityId, universityRecords);
    if (!match.ok) {
      invalidCandidates.push({ candidate, errors: [match.reason] });
      continue;
    }
    resolved.push({ ...candidate, university: match.university });
  }

  const existingCourseKeys = new Set(
    existingCourses.map((course) => `${String(course.universityId || "")}:${String(course.code || "")}`.toLowerCase())
  );

  const safeInsertions = [];
  let existingDuplicateCount = 0;
  for (const candidate of resolved) {
    const courseKey = `${String(candidate.university._id || candidate.universityId || "")}:${String(candidate.code || "")}`.toLowerCase();
    if (existingCourseKeys.has(courseKey)) {
      existingDuplicateCount += 1;
      continue;
    }
    safeInsertions.push({
      ...candidate,
      universityId: candidate.university && candidate.university._id ? String(candidate.university._id) : String(candidate.universityId || ""),
    });
  }

  if (apply) {
    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is required for apply mode.");
    }
    if (confirmation !== "YES") {
      throw new Error("Apply mode requires the explicit confirmation flag: UNILINK_CATALOGUE_CONFIRM=YES");
    }

    const mongoose = require("mongoose");
    const Course = require("../src/models/Course");
    let connected = false;

    try {
      await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
      connected = true;

      for (const candidate of safeInsertions) {
        await Course.updateOne(
          { universityId: candidate.universityId, code: candidate.code },
          {
            $setOnInsert: {
              title: candidate.title,
              code: candidate.code,
              description: candidate.evidenceNotes || candidate.title,
              qualificationLevel: candidate.qualificationLevel,
              fieldOfStudy: candidate.fieldOfStudy || "",
              verificationStatus: candidate.verificationStatus,
              verificationSource: candidate.verificationSource || candidate.sourceUrl || null,
              universityId: candidate.universityId,
              unitIds: [],
              enrolledStudentIds: [],
              createdAt: new Date(),
            },
          },
          { upsert: true }
        );
      }
    } finally {
      if (connected) {
        await mongoose.disconnect();
      }
    }
  }

  return {
    dryRun: !apply,
    apply,
    candidatesRead: candidates.length,
    validCandidates: validCandidates.length,
    rejected: invalidCandidates.length,
    safeInsertions: safeInsertions.length,
    existingDuplicateCount,
    resolvedCount: resolved.length,
    invalidCandidates,
    insertsProposed: safeInsertions.length,
    writesAttempted: apply ? safeInsertions.length : 0,
    confirmation,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  try {
    const result = await runCatalogueImport({
      filePath: options.file,
      apply: options.apply,
      confirmation: process.env.UNILINK_CATALOGUE_CONFIRM || "",
      universityRecords: [],
      existingCourses: [],
    });

    console.log("Catalogue import summary");
    console.log(JSON.stringify({
      dryRun: result.dryRun,
      candidatesRead: result.candidatesRead,
      validCandidates: result.validCandidates,
      insertsProposed: result.insertsProposed,
      rejected: result.rejected,
      existingDuplicateCount: result.existingDuplicateCount,
      writesAttempted: result.writesAttempted,
    }, null, 2));

    if (result.rejected > 0) {
      process.exitCode = 1;
    }
  } catch (error) {
    console.error("Catalogue import failed:", error.message);
    process.exitCode = 1;
  }
}

module.exports = {
  parseArgs,
  readCandidateFile,
  runCatalogueImport,
};

if (require.main === module) {
  main();
}
