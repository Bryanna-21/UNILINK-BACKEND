"use strict";

// Whether a catalogue seed may write. Writing needs BOTH --apply AND UNILINK_CATALOGUE_CONFIRM=YES, so a single
// mistyped flag or a stray environment cannot change the live database. Anything else is a dry run.
//
// (The same two-key rule is used by scripts/importCatalogueCandidates.js.)

function seedMode(argv = [], env = {}) {
  const apply = argv.includes("--apply");
  const confirmed = env.UNILINK_CATALOGUE_CONFIRM === "YES";
  if (apply && confirmed) return { mode: "apply", dryRun: false };
  if (apply && !confirmed) {
    return { mode: "blocked", dryRun: true, message: "--apply needs UNILINK_CATALOGUE_CONFIRM=YES as well. Nothing was written (this was a dry run)." };
  }
  return { mode: "dry-run", dryRun: true };
}

module.exports = { seedMode };
