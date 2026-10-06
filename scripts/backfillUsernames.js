// Gives every existing account a username. DRY RUN by default: prints what it would do and
// writes nothing. Add --apply to write. Safe to re-run: it only touches accounts that still
// have no username, and older accounts are processed first so they get the cleanest names.
//
//   node scripts/backfillUsernames.js            (dry run)
//   node scripts/backfillUsernames.js --apply
//   node scripts/backfillUsernames.js --uri="mongodb+srv://..."   (if no env var is found)
"use strict";

try { require("dotenv").config(); } catch (_) { /* dotenv is optional */ }

const mongoose = require("mongoose");
const User = require("../src/models/User");
const rules = require("../src/utils/username.rules");

const APPLY = process.argv.includes("--apply");
const uriArg = process.argv.find((a) => a.startsWith("--uri="));
const uri =
  (uriArg && uriArg.slice(6)) ||
  process.env.MONGODB_URI || process.env.MONGO_URI || process.env.MONGO_URL ||
  process.env.DATABASE_URL || process.env.DB_URI;

const NO_USERNAME = { $or: [{ username: { $exists: false } }, { username: null }] };

(async () => {
  if (!uri) {
    const hints = Object.keys(process.env).filter((k) => /MONGO|DB|DATABASE/i.test(k));
    console.error("No database connection string found in the environment.");
    console.error(hints.length ? "Variables that look related (names only): " + hints.join(", ") : "None of the usual variable names are set.");
    console.error('Pass it explicitly:  node scripts/backfillUsernames.js --uri="<your connection string>"');
    process.exit(1);
  }

  await mongoose.connect(uri);
  try {
    const existing = await User.find({ username: { $type: "string" } }).select("username").lean();
    const taken = new Set(existing.map((u) => u.username));

    const todo = await User.find({ deletedAt: null, ...NO_USERNAME })
      .select("_id name email createdAt")
      .sort({ createdAt: 1 })
      .lean();

    const plan = [];
    for (const u of todo) {
      const username = await rules.generateUsername({
        name: u.name,
        email: u.email,
        isTaken: async (c) => taken.has(c),
      });
      taken.add(username);
      plan.push({ id: u._id, name: u.name, username });
    }

    console.log(`Accounts already holding a username: ${existing.length}`);
    console.log(`Accounts that need one:              ${plan.length}`);
    plan.slice(0, 20).forEach((p) => console.log(`  ${String(p.name).padEnd(28)} -> @${p.username}`));
    if (plan.length > 20) console.log(`  ... and ${plan.length - 20} more`);

    if (!APPLY) {
      console.log("\nDRY RUN: nothing was written. Re-run with --apply to assign these.");
      return;
    }
    if (!plan.length) {
      console.log("\nNothing to do.");
      return;
    }

    await User.createIndexes(); // builds only missing indexes; never drops anything
    let written = 0;
    let failed = 0;
    for (let i = 0; i < plan.length; i += 200) {
      const chunk = plan.slice(i, i + 200);
      try {
        const res = await User.bulkWrite(
          chunk.map((p) => ({
            updateOne: { filter: { _id: p.id, ...NO_USERNAME }, update: { $set: { username: p.username } } },
          })),
          { ordered: false }
        );
        written += res.modifiedCount ?? res.nModified ?? 0;
      } catch (err) {
        const partial = err.result || {};
        written += partial.modifiedCount ?? partial.nModified ?? 0;
        failed += (err.writeErrors || []).length || chunk.length;
        console.error("Some writes failed (duplicates are retried on the next run):", err.message);
      }
    }
    console.log(`\nWritten: ${written}   Failed: ${failed}${failed ? "   (re-run to retry the failures)" : ""}`);
  } finally {
    await mongoose.disconnect();
  }
})().catch((err) => {
  console.error("Backfill failed:", err.message);
  process.exit(1);
});
