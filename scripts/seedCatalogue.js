"use strict";

// Seeds the institution catalogue: institutions by type, their starter courses (certificate, diploma, higher diploma,
// degree) and illustrative unit structures. Everything is marked "needs verification".
//
//   node scripts/seedCatalogue.js            -> DRY RUN (default): prints what it would do, writes nothing
//   UNILINK_CATALOGUE_CONFIRM=YES node scripts/seedCatalogue.js --apply    -> writes (both are required)
//
// Safe to run repeatedly: it only adds. It never deletes, never overwrites a title, code or verified status, only
// fills empty metadata on existing courses and institutions, and only seeds units into a course that has none.

require("dotenv").config();

const mongoose = require("mongoose");
const { createCatalogueCore } = require("../src/services/catalogue.core");
const repo = require("../src/services/catalogue.repo");
const CourseUnit = require("../src/models/CourseUnit");
const Course = require("../src/models/Course");
const University = require("../src/models/University");
const institutions = require("../src/data/catalogue/institutions");
const templates = require("../src/data/catalogue/courseTemplates");
const curricula = require("../src/data/catalogue/curricula");
const { seedMode } = require("../src/utils/seedGuard.rules");

async function main() {
  const guard = seedMode(process.argv.slice(2), process.env);
  const apply = guard.mode === "apply";
  if (guard.message) console.warn(`\n${guard.message}`);
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not configured.");
  await mongoose.connect(process.env.MONGO_URI);

  if (apply) {
    // Make sure the unique indexes exist BEFORE inserting, so duplicates are impossible even under a race.
    await Promise.all([CourseUnit.init(), Course.init(), University.init()]);
  }

  const core = createCatalogueCore({ repo });
  const stats = await core.seed({ institutions, templates, curricula, dryRun: !apply });

  console.log(apply ? "\n===== CATALOGUE SEED (APPLIED) =====" : "\n===== CATALOGUE SEED (DRY RUN, nothing written) =====");
  console.log(`Institutions: ${stats.institutions.created} to create, ${stats.institutions.matched} already existed, ${stats.institutions.typed} given a type`);
  console.log(`Courses:      ${stats.courses.created} to create, ${stats.courses.matched} already existed, ${stats.courses.filled} had missing details filled`);
  console.log(`Units:        ${stats.units.created} to create, ${stats.units.coursesAlreadyHadUnits} courses skipped because they already have units`);
  if (!apply) console.log("\nTo write these changes run: UNILINK_CATALOGUE_CONFIRM=YES node scripts/seedCatalogue.js --apply");
}

main()
  .catch((error) => {
    console.error("\nCATALOGUE SEED FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
