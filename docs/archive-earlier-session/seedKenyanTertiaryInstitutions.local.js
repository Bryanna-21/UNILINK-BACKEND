"use strict";

require("dotenv").config();

const mongoose = require("mongoose");
const University = require("../src/models/University");

const SOURCE = "https://kmtc.ac.ke/campuses";

// Campus names cross-referenced against KMTC's official campus material.
// Satellites are listed separately only where official KMTC material names them.
const CAMPUSES = [
  "Awendo",
  "Bomet",
  "Bondo",
  "Bungoma",
  "Burnt Forest",
  "Busia",
  "Butula",
  "Chemolingot",
  "Chuka",
  "Chwele",
  "Eldoret",
  "Embu",
  "Garissa",
  "Gatundu",
  "Homa Bay",
  "Imenti",
  "Isiolo",
  "Iten",
  "Kabarnet",
  "Kakamega",
  "Kangema",
  "Kangundo",
  "Kapenguria",
  "Kapkatet",
  "Kaptumo",
  "Karen",
  "Karuri",
  "Kerio Valley",
  "Kilifi",
  "Kinangop",
  "Kisii",
  "Kisumu",
  "Kitale",
  "Kitui",
  "Kombewa",
  "Kuria",
  "Kwale",
  "Lake Victoria",
  "Lamu",
  "Lodwar",
  "Loitoktok",
  "Lugari",
  "Machakos",
  "Makindu",
  "Makueni",
  "Mandera",
  "Manza",
  "Marimanti",
  "Marsabit",
  "Mathari",
  "Mathare",
  "Maua",
  "Mbooni",
  "Mbuvo",
  "Meru",
  "Migori",
  "Molo",
  "Mombasa",
  "Mosoriot",
  "Msambweni",
  "Murang'a",
  "Mutomo",
  "Mwingi",
  "Nairobi",
  "Nakuru",
  "Narok",
  "Navakholo",
  "Ndhiwa",
  "Nyahururu",
  "Nyamache",
  "Nyamira",
  "Nyandarua",
  "Nyeri",
  "Othaya",
  "Port Reitz",
  "Rachuonyo",
  "Rera",
  "Shian​da - Mumias".replace("\u200b", ""),
  "Siaya",
  "Sigowet",
  "Tana River",
  "Taveta",
  "Teso",
  "Thika",
  "Transmara",
  "Ugenya",
  "Ugunja",
  "Vihiga",
  "Voi",
  "Wajir",
  "Webuye",
  "Yatta",
  "Gatundu - Mutunguru",
  "Kitui - Mutomo Satellite",
  "Makueni - Mbuvo Satellite",
  "Nyandarua - Kinangop Satellite",
  "Nyeri - Othaya Satellite",
  "Siaya - Ugunja Satellite",
  "Homa Bay - Ndhiwa Satellite",
  "Migori - Awendo Satellite",
  "Bondo - Masita Satellite"
];

const uniqueCampuses = [...new Set(CAMPUSES)];

const INSTITUTIONS = uniqueCampuses.map((campus) => ({
  name: `Kenya Medical Training College - ${campus} Campus`,
  country: "Kenya",
  institutionType: "medical_training_college",
  catalogueVerificationStatus: "needs_client_verification",
  verificationSource: SOURCE,
  status: "inactive",
  verified: false
}));

async function main() {
  const apply = process.argv.includes("--apply");

  console.log("KMTC campus candidates:", INSTITUTIONS.length);
  console.log("Mode:", apply ? "APPLY" : "DRY RUN");

  if (!apply) {
    for (const item of INSTITUTIONS) {
      console.log(`- ${item.name}`);
    }
    console.log("\nDRY RUN ONLY: no database connection or writes.");
    console.log("Review this candidate list before using --apply.");
    return;
  }

  const uri = process.env.MONGODB_URI || process.env.MONGO_URI;
  if (!uri) {
    throw new Error("MONGODB_URI or MONGO_URI is required for --apply.");
  }

  await mongoose.connect(uri);

  let inserted = 0;
  let metadataUpdated = 0;
  let unchanged = 0;
  let errors = 0;

  try {
    for (const item of INSTITUTIONS) {
      try {
        const existing = await University.findOne({ name: item.name })
          .collation({ locale: "en", strength: 2 })
          .select("_id institutionType catalogueVerificationStatus")
          .lean();

        if (existing) {
          const set = {};

          if (!existing.institutionType) {
            set.institutionType = item.institutionType;
          }
          if (!existing.catalogueVerificationStatus) {
            set.catalogueVerificationStatus =
              "needs_client_verification";
          }

          if (Object.keys(set).length) {
            await University.updateOne(
              { _id: existing._id },
              { $set: set }
            );
            metadataUpdated++;
          } else {
            unchanged++;
          }
          continue;
        }

        await University.create(item);
        inserted++;
      } catch (error) {
        errors++;
        console.error(`FAILED: ${item.name}: ${error.message}`);
      }
    }

    console.log(JSON.stringify({
      success: errors === 0,
      candidates: INSTITUTIONS.length,
      inserted,
      metadataUpdated,
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

main().catch((error) => {
  console.error("KMTC seed failed:", error.message);
  process.exitCode = 1;
});
