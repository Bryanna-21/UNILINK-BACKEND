// One-time backfill: assigns universityId to every existing Club and
// Announcement that doesn't have one yet, based on each document's
// original creator's own universityId (Club.ownerId / Announcement.postedBy).
//
// SAFE TO RUN MULTIPLE TIMES — only touches documents where
// universityId is currently null/undefined, so re-running after a
// partial failure just picks up where it left off.
//
// Run with: node scripts/backfillUniversityScoping.js
// Requires the same DB connection env vars as the main app (.env).

require("dotenv").config();
const mongoose = require("mongoose");
const Club = require("../src/models/Club");
const Announcement = require("../src/models/Announcement");
const User = require("../src/models/User");

async function backfillCollection(Model, ownerField, label) {
  const docs = await Model.find({
    $or: [{ universityId: { $exists: false } }, { universityId: null }],
  });

  console.log(`[${label}] Found ${docs.length} documents needing backfill.`);

  let updated = 0;
  let skipped = 0;

  for (const doc of docs) {
    const ownerId = doc[ownerField];
    if (!ownerId) {
      console.log(`[${label}] Skipping ${doc._id} — no ${ownerField} to look up.`);
      skipped++;
      continue;
    }
    const owner = await User.findById(ownerId).select("universityId");
    if (!owner?.universityId) {
      console.log(`[${label}] Skipping ${doc._id} — owner ${ownerId} has no universityId either.`);
      skipped++;
      continue;
    }
    doc.universityId = owner.universityId;
    await doc.save();
    updated++;
  }

  console.log(`[${label}] Done. Updated: ${updated}, Skipped (needs manual review): ${skipped}.`);
}

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to database.");

  await backfillCollection(Club, "ownerId", "Club");
  await backfillCollection(Announcement, "postedBy", "Announcement");

  await mongoose.disconnect();
  console.log("Backfill complete. Disconnected.");
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
