"use strict";

require("dotenv").config();

const mongoose = require("mongoose");
const University = require("../src/models/University");

const SOURCE = "https://teachersupgrade.kuccps.ac.ke/institutions/";

const TTCS = [
  "Aberdare Teachers Training College",
  "Asumbi Teachers Training College",
  "Bishop Mahon Teachers Training College",
  "Bondo Teachers Training College",
  "Borabu Teachers Training College",
  "Bunyore Teachers Training College",
  "Chesta Teachers Training College",
  "Egoji Teachers Training College",
  "Eregi Teachers Training College",
  "Galana Teachers Training College",
  "Garissa Teachers Training College",
  "Kaimosi Teachers Training College",
  "Kamwenja Teachers Training College",
  "Kenyenya Teachers Training College",
  "Kericho Teachers College",
  "St Marks Kigari Teachers College",
  "St John Teachers Training College - Kilimambogo",
  "Kitui Teachers Training College",
  "Kwale Teachers Training College",
  "Machakos Teachers Training College",
  "Mandera Teachers Training College",
  "Meru Teachers Training College",
  "Migori Teachers College",
  "Moi Teachers College - Baringo",
  "Mosoriot Teachers College",
  "Murang'a Teachers Training College",
  "Narok Teachers Training College",
  "Seme Teachers College",
  "Shanzu Teachers College",
  "Tambach Teachers Training College",
  "Tarbaj Teachers Training College",
  "Thogoto Teachers College",
  "Ugenya Teachers Training College",
  "Kagumo Teachers Training College",
  "Kibabii Diploma Teachers Training College",
  "Lugari Teachers College"
];

async function main() {
  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;

  if (!uri) {
    throw new Error("MONGODB_URI or MONGO_URI is missing.");
  }

  console.log("Kenyan TTC candidates:", TTCS.length);
  console.log("Mode: APPLY");

  await mongoose.connect(uri);

  let inserted = 0;
  let unchanged = 0;
  let errors = 0;

  try {
    for (const name of TTCS) {
      const record = {
        name,
        country: "Kenya",
        institutionType: "teacher_training_college",
        catalogueVerificationStatus: "needs_client_verification",
        verificationSource: SOURCE,
        status: "inactive",
        verified: false
      };

      try {
        const existing = await University.findOne({ name })
          .collation({ locale: "en", strength: 2 })
          .select("_id")
          .lean();

        if (existing) {
          unchanged++;
          console.log("EXISTS:", name);
          continue;
        }

        await University.create(record);
        inserted++;
        console.log("INSERTED:", name);
      } catch (error) {
        errors++;
        console.error("FAILED:", name, "-", error.message);
      }
    }

    console.log("\nTTC IMPORT SUMMARY");
    console.log(JSON.stringify({
      candidates: TTCS.length,
      inserted,
      unchanged,
      errors,
      newRecordsActive: false,
      newRecordsVerified: false
    }, null, 2));

    if (errors) process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
}

main().catch(error => {
  console.error("TTC seed failed:", error.message);
  process.exitCode = 1;
});
