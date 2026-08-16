// Read-only pre-deploy check: scans University, Course, and Unit for
// existing duplicates BEFORE the new unique indexes (see
// models/University.js, Course.js, Unit.js) get applied.
//
// Why this matters: MongoDB cannot create a unique index over data
// that already violates it. If duplicates exist, the index either
// fails to build or (depending on driver/timing) silently never gets
// enforced - either way, you find out the hard way, later, when a
// duplicate slips through in production. This script tells you before
// that happens, not after.
//
// This script makes NO changes. It only reports. Deciding how to
// merge/delete duplicates is a judgment call (which university record
// is the "real" one? do courses reference the one being removed?) -
// deliberately not automated here.
//
// Usage:
//   MONGO_URI="..." node scripts/checkDuplicates.js
//
// Exit code 0 = no duplicates found, safe to deploy the unique indexes.
// Exit code 1 = duplicates found, listed below - resolve before deploying.

require("dotenv").config();
const mongoose = require("mongoose");

const University = require("../src/models/University");
const Course = require("../src/models/Course");
const Unit = require("../src/models/Unit");

// Mirrors the case-insensitive collation used in the real unique
// indexes (strength: 2 = case-insensitive) - lowercasing here is a
// reasonable proxy for that comparison for reporting purposes.
function findDuplicateGroups(docs, keyFn) {
  const groups = new Map();
  for (const doc of docs) {
    const key = keyFn(doc);
    if (!groups.has(key)) groups.set(key, []);
    groups.get(key).push(doc);
  }
  return [...groups.values()].filter((group) => group.length > 1);
}

async function main() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not configured.");
  }

  await mongoose.connect(process.env.MONGO_URI, { serverSelectionTimeoutMS: 5000 });
  console.log("✓ Connected to MongoDB\n");

  let foundAny = false;

  // --- Universities: unique on name (case-insensitive) ---
  const universities = await University.find({}).lean();
  const dupUniversities = findDuplicateGroups(universities, (u) => (u.name || "").trim().toLowerCase());
  if (dupUniversities.length > 0) {
    foundAny = true;
    console.log(`✗ ${dupUniversities.length} duplicate university name group(s):`);
    for (const group of dupUniversities) {
      console.log(`  "${group[0].name}" — ${group.length} records: ${group.map((g) => g._id).join(", ")}`);
    }
    console.log();
  } else {
    console.log(`✓ Universities: ${universities.length} records, no duplicates.\n`);
  }

  // --- Courses: unique on (universityId, code) case-insensitive ---
  const courses = await Course.find({}).lean();
  const dupCourses = findDuplicateGroups(
    courses,
    (c) => `${c.universityId || "none"}::${(c.code || "").trim().toLowerCase()}`
  );
  if (dupCourses.length > 0) {
    foundAny = true;
    console.log(`✗ ${dupCourses.length} duplicate course code group(s) (same university):`);
    for (const group of dupCourses) {
      console.log(
        `  code "${group[0].code}" at university ${group[0].universityId} — ${group.length} records: ${group
          .map((g) => g._id)
          .join(", ")}`
      );
    }
    console.log();
  } else {
    console.log(`✓ Courses: ${courses.length} records, no duplicates.\n`);
  }

  // --- Units: unique on (courseId, title) case-insensitive ---
  const units = await Unit.find({}).lean();
  const dupUnits = findDuplicateGroups(
    units,
    (u) => `${u.courseId || "none"}::${(u.title || "").trim().toLowerCase()}`
  );
  if (dupUnits.length > 0) {
    foundAny = true;
    console.log(`✗ ${dupUnits.length} duplicate unit title group(s) (same course):`);
    for (const group of dupUnits) {
      console.log(
        `  title "${group[0].title}" in course ${group[0].courseId} — ${group.length} records: ${group
          .map((g) => g._id)
          .join(", ")}`
      );
    }
    console.log();
  } else {
    console.log(`✓ Units: ${units.length} records, no duplicates.\n`);
  }

  if (foundAny) {
    console.log("✗ Duplicates found. Resolve these before deploying the new unique indexes,");
    console.log("  or MongoDB will fail to build the index (or worse, silently not enforce it).");
    process.exitCode = 1;
  } else {
    console.log("✓ No duplicates found in any of the three collections. Safe to deploy.");
    process.exitCode = 0;
  }
}

main()
  .catch((error) => {
    console.error("✗ Duplicate check failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
