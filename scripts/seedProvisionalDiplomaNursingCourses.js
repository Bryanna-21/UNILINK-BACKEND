"use strict";

require("dotenv").config();

const mongoose = require("mongoose");
const University = require("../src/models/University");
const Course = require("../src/models/Course");

// Explicitly provisional course suggestions. This script intentionally does
// not attach these to institutions by default: a client must map each programme
// to the institution(s) that confirm offering it before running the import.
const PROVISIONAL_PROGRAMMES = [
  { title: "Diploma in Nursing", code: "DIP-NURSING", qualificationLevel: "diploma", fieldOfStudy: "nursing" },
  { title: "Higher Diploma in Nursing", code: "HDIP-NURSING", qualificationLevel: "higher_diploma", fieldOfStudy: "nursing" },
  { title: "Certificate in Nursing", code: "CERT-NURSING", qualificationLevel: "certificate", fieldOfStudy: "nursing" },
  { title: "Diploma in Community Health Nursing", code: "DIP-COMM-HEALTH-NURSING", qualificationLevel: "diploma", fieldOfStudy: "nursing" },
  { title: "Diploma in Perioperative Theatre Technology", code: "DIP-PERI-TECH", qualificationLevel: "diploma", fieldOfStudy: "health" },
  { title: "Diploma in Medical Laboratory Sciences", code: "DIP-MED-LAB", qualificationLevel: "diploma", fieldOfStudy: "health" },
  { title: "Diploma in Information Technology", code: "DIP-IT", qualificationLevel: "diploma", fieldOfStudy: "information_technology" },
  { title: "Diploma in Business Management", code: "DIP-BUS-MGMT", qualificationLevel: "diploma", fieldOfStudy: "business" },
  { title: "Diploma in Electrical Engineering", code: "DIP-ELECTRICAL", qualificationLevel: "diploma", fieldOfStudy: "engineering" },
  { title: "Diploma in Mechanical Engineering", code: "DIP-MECHANICAL", qualificationLevel: "diploma", fieldOfStudy: "engineering" }
];

async function main() {
  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required. No database changes were made.");
  }
  const requestedNames = process.argv.slice(2);
  if (!requestedNames.length) {
    console.log("DRY RUN — no courses inserted.");
    console.log("Provisional programmes:");
    for (const p of PROVISIONAL_PROGRAMMES) console.log(`- ${p.code}: ${p.title} (${p.qualificationLevel}; unverified)`);
    console.log("\nAfter the client confirms which institution offers each programme, run:");
    console.log('node scripts/seedProvisionalDiplomaNursingCourses.js "Exact Institution Name"');
    console.log("This script is blocked until Course schema supports qualificationLevel and verification metadata.");
    return;
  }

  // Fail closed rather than silently dropping metadata under Mongoose strict mode.
  const paths = Course.schema.paths;
  for (const requiredPath of ["qualificationLevel", "verificationStatus", "fieldOfStudy"]) {
    if (!paths[requiredPath]) {
      throw new Error(`Course schema is missing "${requiredPath}". Apply patches/schema-and-controller-checklist.md first.`);
    }
  }

  await mongoose.connect(process.env.MONGODB_URI);
  let inserted = 0;
  let updated = 0;
  try {
    for (const name of requestedNames) {
      const institution = await University.findOne({ name }).select("_id name").lean();
      if (!institution) throw new Error(`Institution not found: ${name}`);
      for (const p of PROVISIONAL_PROGRAMMES) {
        const filter = { universityId: String(institution._id), code: p.code };
        const existing = await Course.findOne(filter).select("_id").lean();
        await Course.updateOne(filter, {
          $setOnInsert: {
            title: p.title,
            description: "Provisional programme entry. Confirm current availability, award level and official programme title with the institution.",
            universityId: String(institution._id),
            unitIds: [],
            enrolledStudentIds: [],
            verificationStatus: "needs_client_verification",
            verificationSource: null,
            fieldOfStudy: p.fieldOfStudy,
            qualificationLevel: p.qualificationLevel
          }
        }, { upsert: true });
        if (existing) updated += 1;
        else inserted += 1;
      }
    }
    console.log(JSON.stringify({ success: true, inserted, alreadyPresent: updated, verificationStatus: "needs_client_verification" }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((error) => {
  console.error("Provisional programme import failed:", error.message);
  process.exitCode = 1;
});
