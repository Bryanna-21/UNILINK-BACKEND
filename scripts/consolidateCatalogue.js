"use strict";

// Tidies the institution list. DRY RUN by default; writing needs --apply AND UNILINK_CATALOGUE_CONFIRM=YES.
//   node scripts/consolidateCatalogue.js
//   UNILINK_CATALOGUE_CONFIRM=YES node scripts/consolidateCatalogue.js --apply
//
// What it does (and only this):
//   1. KMTC: creates each "Kenya Medical Training College - X Campus" as a Campus under the ONE KMTC institution, then
//      sets the old campus-record to status "inactive" so it leaves the registration list. Nothing is deleted. A record
//      that has students or course enrolments is left alone and reported.
//   2. Types untyped teacher training colleges as "teacher_training".
// It only REPORTS (never changes): possible duplicate teacher colleges, students pointing at a missing institution,
// and courses with no institution.

require("dotenv").config();

const mongoose = require("mongoose");
const University = require("../src/models/University");
const Campus = require("../src/models/Campus");
const Course = require("../src/models/Course");
const User = require("../src/models/User");
const { seedMode } = require("../src/utils/seedGuard.rules");
const rules = require("../src/utils/consolidation.rules");

const CI = { locale: "en", strength: 2 };

async function main() {
  const guard = seedMode(process.argv.slice(2), process.env);
  const apply = guard.mode === "apply";
  if (guard.message) console.warn(`\n${guard.message}`);
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not configured.");
  await mongoose.connect(process.env.MONGO_URI);

  const institutions = await University.find({}).select("_id name status institutionType country").lean();
  const students = await User.aggregate([
    { $match: { deletedAt: null, universityId: { $nin: [null, ""] } } },
    { $group: { _id: "$universityId", n: { $sum: 1 } } },
  ]);
  const courses = await Course.find({}).select("_id universityId title code enrolledStudentIds").lean();

  const studentsByUni = Object.fromEntries(students.map((r) => [String(r._id), r.n]));
  const coursesByUni = {};
  const enrolmentsByUni = {};
  for (const c of courses) {
    const k = String(c.universityId);
    coursesByUni[k] = (coursesByUni[k] || 0) + 1;
    enrolmentsByUni[k] = (enrolmentsByUni[k] || 0) + (c.enrolledStudentIds || []).length;
  }

  console.log(apply ? "\n===== CONSOLIDATE (APPLIED) =====" : "\n===== CONSOLIDATE (DRY RUN, nothing written) =====");

  // 1. KMTC
  const plan = rules.planKmtcConsolidation({ institutions, studentsByUni, coursesByUni, enrolmentsByUni });
  if (!plan.ok) {
    console.log(`\nKMTC: skipped. ${plan.reason}`);
  } else {
    const c = plan.counts;
    console.log(`\nKMTC: ${c.total} campus record(s) found under "${plan.canonical.name}": ${c.consolidate} to consolidate, ${c.blocked} blocked, ${c.alreadyInactive} already inactive.`);
    for (const b of plan.campuses.filter((x) => x.action === "blocked")) console.log(`  BLOCKED  ${b.recordName}: ${b.blockers.join("; ")}`);
    for (const d of plan.campuses.filter((x) => x.duplicateOfCampus)) console.log(`  NOTE     "${d.recordName}" repeats the campus name "${d.duplicateOfCampus}"`);
    const withCourses = plan.campuses.filter((x) => x.action === "consolidate" && x.coursesOnRecord > 0);
    if (withCourses.length) console.log(`  NOTE     ${withCourses.length} record(s) carry courses of their own; they stay in the database but leave the picker.`);
    // Every campus-record that is not blocked becomes a campus of the one KMTC institution, including records that were
    // already deactivated by an earlier clean-up (those had no campus created for them).
    const existing = new Set((await Campus.find({ universityId: plan.canonical.id }).select("name").lean()).map((c) => String(c.name).toLowerCase()));
    const wanted = plan.campuses.filter((y) => y.ensureCampus);
    const toCreate = wanted.filter((y) => !existing.has(y.campusName.toLowerCase()));
    console.log(`  Campuses under "${plan.canonical.name}": ${existing.size} exist, ${toCreate.length} to create.`);
    if (apply) {
      let made = 0, retired = 0;
      for (const x of wanted) {
        const r = await Campus.updateOne(
          { universityId: plan.canonical.id, name: x.campusName },
          { $setOnInsert: { universityId: plan.canonical.id, name: x.campusName, status: "active" } },
          { upsert: true, collation: CI }
        );
        if (r.upsertedCount) made += 1;
        if (x.action === "consolidate") {
          const u = await University.updateOne({ _id: x.recordId, status: "active" }, { $set: { status: "inactive", catalogueSource: "consolidated-into-kmtc" } });
          retired += u.modifiedCount || 0;
        }
      }
      console.log(`  written: ${made} campus(es) created, ${retired} record(s) set inactive.`);
    }
  }

  // 2. Teacher colleges
  const toType = rules.teacherCollegesToType(institutions);
  console.log(`\nTeacher colleges: ${toType.length} untyped record(s) to type as "teacher_training".`);
  if (apply && toType.length) {
    const r = await University.updateMany({ _id: { $in: toType.map((i) => i._id) }, institutionType: null }, { $set: { institutionType: "teacher_training" } });
    console.log(`  written: ${r.modifiedCount} record(s) typed.`);
  }

  // Reports only
  const pairs = rules.possibleDuplicateTeacherColleges(institutions);
  console.log(`\nREPORT (not changed): ${pairs.length} possible duplicate teacher-college pair(s):`);
  for (const [a, b] of pairs) console.log(`  ${a}   <>   ${b}`);

  const ids = new Set(institutions.map((i) => String(i._id)));
  const lost = await User.find({ deletedAt: null, universityId: { $nin: [null, ""] } }).select("_id role universityId createdAt programme yearOfStudy semester onboardingCompletedAt").lean();
  const missing = lost.filter((u) => !ids.has(String(u.universityId)));
  console.log(`\nREPORT (not changed): ${missing.length} account(s) point at an institution that no longer exists:`);
  for (const u of missing) {
    const done = !!(u.onboardingCompletedAt || (u.programme && u.yearOfStudy && u.semester));
    console.log(`  id ${u._id} | ${u.role} | signed up ${u.createdAt ? new Date(u.createdAt).toISOString().slice(0, 10) : "?"} | setup finished: ${done ? "yes (university is locked)" : "no"}`);
  }
  const orphanCourses = courses.filter((c) => !ids.has(String(c.universityId)));
  console.log(`\nREPORT (not changed): ${orphanCourses.length} course(s) with no institution: ${orphanCourses.map((c) => `${c.code || "?"} "${c.title}"`).join("; ") || "none"}`);

  if (!apply) console.log("\nTo write the changes above run: UNILINK_CATALOGUE_CONFIRM=YES node scripts/consolidateCatalogue.js --apply");
}

main()
  .catch((error) => { console.error("\nCONSOLIDATE FAILED"); console.error(error); process.exitCode = 1; })
  .finally(async () => { await mongoose.disconnect(); });
