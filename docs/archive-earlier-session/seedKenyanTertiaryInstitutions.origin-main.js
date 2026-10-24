"use strict";

require("dotenv").config();

const mongoose = require("mongoose");
const University = require("../src/models/University");

// Candidate catalogue only. Verify legal/official status and preferred naming
// with the client before production use. Upsert is additive and repeatable.
const INSTITUTIONS = [
  ["Kenya Medical Training College", "medical_training_college"],
  ["Kenya Institute of Social Work and Community Development", "technical_institute"],
  ["Kenya Institute of Highways and Building Technology", "technical_institute"],
  ["Kenya Institute of Special Education", "teacher_training_college"],
  ["Kenya Technical Trainers College", "teacher_training_college"],
  ["Kenya School of Government", "other_tertiary"],
  ["Kenya Utalii College", "tvet_college"],
  ["Nairobi National Polytechnic", "national_polytechnic"],
  ["Eldoret National Polytechnic", "national_polytechnic"],
  ["Kisumu National Polytechnic", "national_polytechnic"],
  ["Mombasa National Polytechnic", "national_polytechnic"],
  ["Nyeri National Polytechnic", "national_polytechnic"],
  ["Kigari Teachers Training College", "teacher_training_college"],
  ["Machakos Teachers Training College", "teacher_training_college"],
  ["Murang'a Teachers Training College", "teacher_training_college"],
  ["Kisii Teachers Training College", "teacher_training_college"],
  ["Shanzu Teachers Training College", "teacher_training_college"],
  ["Kenya Coast National Polytechnic", "national_polytechnic"],
  ["Rift Valley Institute of Science and Technology", "technical_institute"],
  ["Thika Technical Training Institute", "technical_institute"],
  ["Nairobi Technical Training Institute", "technical_institute"],
  ["Kabete National Polytechnic", "national_polytechnic"],
  ["Kiambu National Polytechnic", "national_polytechnic"],
  ["Meru National Polytechnic", "national_polytechnic"],
  ["Bungoma National Polytechnic", "national_polytechnic"],
  ["Kitale National Polytechnic", "national_polytechnic"],
  ["Sigalagala National Polytechnic", "national_polytechnic"],
  ["Kisiwa Technical Training Institute", "technical_institute"],
  ["Mawego Technical Training Institute", "technical_institute"],
  ["Rift Valley Technical Training Institute", "technical_institute"],
  ["Bomet Technical Training Institute", "technical_institute"],
  ["Kisumu Medical and Education Trust", "medical_training_college"]
].map(([name, institutionType]) => ({
  name,
  country: "Kenya",
  institutionType,
  status: "active",
  verified: false
}));

async function main() {
  const apply = process.argv.includes("--apply");

  if (!apply) {
    console.log("DRY RUN — no database connection or writes.");
    console.log("Candidate institutions:", INSTITUTIONS.length);
    for (const item of INSTITUTIONS) {
      console.log("- " + item.name + " [" + item.institutionType + "]");
    }
    console.log("\nReview candidates, then explicitly pass --apply to write.");
    return;
  }

  if (!process.env.MONGODB_URI) {
    throw new Error("MONGODB_URI is required when --apply is supplied.");
  }

  await mongoose.connect(process.env.MONGODB_URI);
  let inserted = 0;
  let metadataUpdated = 0;
  let unchanged = 0;

  try {
    for (const item of INSTITUTIONS) {
      const existing = await University.findOne({ name: item.name })
        .collation({ locale: "en", strength: 2 })
        .select("_id name country status verified institutionType catalogueVerificationStatus")
        .lean();

      if (existing) {
        const set = {};
        if (!existing.institutionType) set.institutionType = item.institutionType;
        if (!existing.catalogueVerificationStatus) {
          set.catalogueVerificationStatus = "needs_client_verification";
        }

        if (Object.keys(set).length) {
          await University.updateOne({ _id: existing._id }, { $set: set });
          metadataUpdated += 1;
        } else {
          unchanged += 1;
        }
        continue;
      }

      await University.create({
        name: item.name,
        country: item.country,
        institutionType: item.institutionType,
        catalogueVerificationStatus: "needs_client_verification",
        verificationSource: null,
        status: "inactive",
        verified: false
      });
      inserted += 1;
    }

    console.log(JSON.stringify({
      success: true,
      total: INSTITUTIONS.length,
      inserted,
      metadataUpdated,
      unchanged,
      note: "New candidates remain inactive and unverified pending review."
    }, null, 2));
  } finally {
    await mongoose.disconnect();
  }
}
main().catch((error) => {
  console.error("Catalogue seed failed:", error.message);
  process.exitCode = 1;
});
