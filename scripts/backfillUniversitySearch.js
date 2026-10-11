"use strict";

try {
  require("dotenv").config();
} catch (_) {
  // dotenv is optional when environment variables are supplied externally.
}

const mongoose = require("mongoose");
const University = require("../src/models/University");
const {
  normalizeUniversityName,
  universitySearchTokens,
} = require("../src/utils/universitySearch");

const APPLY = process.argv.includes("--apply");
const uriArg = process.argv.find((arg) => arg.startsWith("--uri="));
const uri =
  (uriArg && uriArg.slice(6)) ||
  process.env.MONGODB_URI ||
  process.env.MONGO_URI ||
  process.env.MONGO_URL ||
  process.env.DATABASE_URL ||
  process.env.DB_URI;

(async () => {
  if (!uri) {
    console.error("No database connection string found.");
    console.error('Supply an environment variable or --uri="<connection string>".');
    process.exitCode = 1;
    return;
  }

  await mongoose.connect(uri);

  try {
    const universities = await University.find({})
      .select("_id name nameSearch nameSearchTokens")
      .lean();

    const plan = [];

    for (const university of universities) {
      const nameSearch = normalizeUniversityName(university.name);
      const nameSearchTokens = universitySearchTokens(university.name);

      const tokensMatch =
        Array.isArray(university.nameSearchTokens) &&
        university.nameSearchTokens.length === nameSearchTokens.length &&
        university.nameSearchTokens.every(
          (token, index) => token === nameSearchTokens[index]
        );

      if (
        university.nameSearch !== nameSearch ||
        !tokensMatch
      ) {
        plan.push({
          _id: university._id,
          nameSearch,
          nameSearchTokens,
        });
      }
    }

    console.log(`Universities inspected: ${universities.length}`);
    console.log(`Records needing updates: ${plan.length}`);

    if (!APPLY) {
      console.log("\nDRY RUN: no records or indexes were changed.");
      console.log("Review the plan, then use --apply only with the intended database.");
      return;
    }

    let written = 0;

    for (let i = 0; i < plan.length; i += 200) {
      const chunk = plan.slice(i, i + 200);

      const result = await University.collection.bulkWrite(
        chunk.map((item) => ({
          updateOne: {
            filter: { _id: item._id },
            update: {
              $set: {
                nameSearch: item.nameSearch,
                nameSearchTokens: item.nameSearchTokens,
              },
            },
          },
        })),
        { ordered: false }
      );

      written += result.modifiedCount || 0;
    }

    // Explicit index creation: this script does not drop or rebuild indexes.
    await University.collection.createIndex(
      { status: 1, nameSearch: 1 },
      { name: "university_status_name_search" }
    );

    await University.collection.createIndex(
      { status: 1, nameSearchTokens: 1 },
      { name: "university_status_name_search_tokens" }
    );

    console.log(`\nRecords updated: ${written}`);
    console.log("University search indexes verified/created.");
  } finally {
    await mongoose.disconnect();
  }
})().catch((error) => {
  console.error("University search backfill failed:", error.message);
  process.exitCode = 1;
  mongoose.disconnect().catch(() => {});
});
