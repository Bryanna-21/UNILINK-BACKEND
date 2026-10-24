"use strict";

// READ-ONLY. Prints how many institutions, courses and units the catalogue holds and flags anything odd
// (untyped institutions, orphaned courses, duplicate titles). Writes nothing.
//   node scripts/catalogueStats.js

require("dotenv").config();

const mongoose = require("mongoose");
const University = require("../src/models/University");
const Course = require("../src/models/Course");
const CourseUnit = require("../src/models/CourseUnit");
const { summarise } = require("../src/utils/catalogueStats.rules");

async function main() {
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not configured.");
  await mongoose.connect(process.env.MONGO_URI);

  const [institutions, courses, perCourse, dupes] = await Promise.all([
    University.find({}).select("_id name institutionType").lean(),
    Course.find({}).select("_id universityId code title level qualificationLevel verificationStatus").lean(),
    CourseUnit.aggregate([{ $group: { _id: "$courseId", n: { $sum: 1 } } }]),
    CourseUnit.aggregate([{ $group: { _id: { c: "$courseId", code: "$code" }, n: { $sum: 1 } } }, { $match: { n: { $gt: 1 } } }, { $count: "groups" }]),
  ]);

  const stats = summarise({
    institutions,
    courses,
    unitsByCourse: Object.fromEntries(perCourse.map((r) => [r._id, r.n])),
    unitDuplicateGroups: dupes[0]?.groups || 0,
  });

  console.log("\n===== CATALOGUE STATE (read-only) =====");
  console.log(`Institutions: ${stats.institutions.total}  (untyped ${stats.institutions.untyped}, legacy-typed ${stats.institutions.legacyTyped})`);
  console.log("  by type:", JSON.stringify(stats.institutions.byType));
  console.log(`Courses:      ${stats.courses.total}  (verified ${stats.courses.verified}, needs verification ${stats.courses.needsVerification})`);
  console.log("  by level:", JSON.stringify(stats.courses.byLevel), `| no level: ${stats.courses.withoutLevel}`);
  console.log(`  with units: ${stats.courses.withUnits} | without units: ${stats.courses.withoutUnits}`);
  console.log(`Units:        ${stats.units.total}  (duplicate groups: ${stats.units.duplicateGroups})`);
  if (stats.courses.duplicateTitleGroups.length) {
    console.log("\nSame title, different codes (first 25):");
    for (const d of stats.courses.duplicateTitleGroups) console.log(`  ${d.institution}: "${d.title}" x${d.count} [${d.codes.join(", ")}]`);
  }
  console.log(stats.problems.length ? "\nPROBLEMS:\n- " + stats.problems.join("\n- ") : "\nNo problems found.");
}

main()
  .catch((error) => { console.error("\nSTATS FAILED"); console.error(error); process.exitCode = 1; })
  .finally(async () => { await mongoose.disconnect(); });
