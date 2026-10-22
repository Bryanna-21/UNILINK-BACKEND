"use strict";

const fs = require("fs");
const path = require("path");

const {
  validateCatalogueCandidate,
  detectDuplicateCandidates,
  resolveUniversityMatch,
  candidateKey,
  buildInstitutionGapReport,
  buildInstitutionResearchQueue,
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
      const next = argv[i + 1];
      if (next && !next.startsWith("-")) {
        options.file = path.resolve(next);
        i += 1;
      }
    }
  }

  return options;
}

function readCandidateFile(filePath) {
  const raw = fs.readFileSync(filePath, "utf8");
  const parsed = JSON.parse(raw);

  if (Array.isArray(parsed)) {
    return parsed;
  }

  if (parsed && Array.isArray(parsed.candidates)) {
    return parsed.candidates;
  }

  throw new Error("Catalogue candidate file must contain an array or { candidates: [...] }.");
}

function summarizeValidationError(candidate, errors) {
  return {
    candidate,
    errors,
  };
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

  if (apply && confirmation !== "YES") {
    throw new Error("Apply mode requires both --apply and UNILINK_CATALOGUE_CONFIRM=YES.");
  }

  const validationErrors = [];
  const validCandidates = [];
  const seenInputKeys = new Map();

  for (const candidate of candidates) {
    const result = validateCatalogueCandidate(candidate);
    if (!result.ok) {
      validationErrors.push(summarizeValidationError(candidate, result.errors));
      continue;
    }

    const key = candidateKey(result.normalized);
    if (seenInputKeys.has(key)) {
      validationErrors.push(
        summarizeValidationError(candidate, [`Duplicate candidate code detected within the input file for ${result.normalized.institutionName}.`])
      );
      continue;
    }

    seenInputKeys.set(key, true);
    validCandidates.push(result.normalized);
  }

  const duplicateWithinInput = detectDuplicateCandidates(validCandidates);
  for (const duplicate of duplicateWithinInput) {
    validationErrors.push(summarizeValidationError(duplicate.candidate, duplicate.errors));
  }

  const resolvedCandidates = [];
  const unresolved = [];
  for (const candidate of validCandidates) {
    const match = resolveUniversityMatch(candidate.institutionName, universityRecords);
    if (!match.ok) {
      unresolved.push({ candidate, error: match.reason });
      continue;
    }
    resolvedCandidates.push({ ...candidate, university: match.university });
  }

  const existingCourseKeys = new Set(
    existingCourses.map((course) => `${String(course.universityId || "")}:${String(course.code || "")}`.toLowerCase())
  );

  const safeInserts = [];
  const existingConflicts = [];
  for (const candidate of resolvedCandidates) {
    const institutionId = candidate.university && candidate.university._id ? String(candidate.university._id) : String(candidate.universityId || "");
    const courseKey = `${institutionId}:${String(candidate.code || "")}`.toLowerCase();
    if (existingCourseKeys.has(courseKey)) {
      existingConflicts.push({ candidate, reason: "Existing course with same universityId and code already exists." });
      continue;
    }

    safeInserts.push({
      ...candidate,
      universityId: institutionId,
      createdAt: new Date().toISOString(),
    });
  }

  if (apply) {
    const mongoose = require("mongoose");
    const Course = require("../src/models/Course");

    if (!process.env.MONGO_URI) {
      throw new Error("MONGO_URI is required for apply mode.");
    }

    let connected = false;
    const writeErrors = [];
    const okWrites = [];

    try {
      await mongoose.connect(process.env.MONGO_URI, {
        serverSelectionTimeoutMS: 5000,
      });
      connected = true;

      for (const candidate of safeInserts) {
        try {
          const result = await Course.updateOne(
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
                unitAssignments: [],
                unitIds: [],
                enrolledStudentIds: [],
                createdAt: new Date(),
              },
            },
            { upsert: true }
          );

          if (result && result.upserted && result.upserted.length) {
            okWrites.push(candidate);
          }
        } catch (error) {
          writeErrors.push({ candidate, error: error.message });
        }
      }
    } finally {
      if (connected) {
        await mongoose.disconnect();
      }
    }

    return {
      dryRun: false,
      apply: true,
      candidatesRead: candidates.length,
      validCandidates: validCandidates.length,
      rejected: validationErrors.length + unresolved.length + existingConflicts.length + writeErrors.length,
      safeInsertions: safeInserts.length,
      writesAttempted: safeInserts.length,
      validInsertions: okWrites.length,
      writeErrors,
      unresolved,
      validationErrors,
      existingConflicts,
      confirmation,
    };
  }

  return {
    dryRun: true,
    apply: false,
    candidatesRead: candidates.length,
    validCandidates: validCandidates.length,
    rejected: validationErrors.length + unresolved.length + existingConflicts.length,
    safeInsertions: safeInserts.length,
    writesAttempted: 0,
    unresolved,
    validationErrors,
    existingConflicts,
    confirmation,
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  const confirmation = process.env.UNILINK_CATALOGUE_CONFIRM || "";

  try {
    const result = await runCatalogueImport({
      filePath: options.file,
      apply: options.apply,
      confirmation,
      universityRecords: [],
      existingCourses: [],
    });

    console.log("Catalogue import summary");
    console.log(JSON.stringify({
      dryRun: result.dryRun,
      candidatesRead: result.candidatesRead,
      validCandidates: result.validCandidates,
      safeInsertions: result.safeInsertions,
      rejected: result.rejected,
      writesAttempted: result.writesAttempted,
      unresolved: result.unresolved.length,
      validationErrors: result.validationErrors.length,
      existingConflicts: result.existingConflicts.length,
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
  main,
};

if (require.main === module) {
  main();
}

