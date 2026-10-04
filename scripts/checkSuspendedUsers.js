// Read-only pre-deploy check for the Safety & Moderation foundation.
//
// Until now, "suspended" was only a label: nothing in login or request handling ever read it,
// so suspended users kept full access. The foundation makes suspension REAL on every request.
// That means any account an admin has ever "suspended" will be locked out the moment this
// ships. This script lists them first, so nobody is surprised.
//
// This script makes NO changes.
//
// Usage:   MONGO_URI="..." node scripts/checkSuspendedUsers.js
// Exit code 0 = no suspended accounts, safe to deploy.
// Exit code 1 = some exist (listed). Reactivate any that should not be locked out, or
//               deploy with MODERATION_ENFORCE_STATUS=false until you have reviewed them.

require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../src/models/User");

(async () => {
  await mongoose.connect(process.env.MONGO_URI || process.env.MONGODB_URI);
  const suspended = await User.find({ status: "suspended" }).select("name email role universityId createdAt").lean();
  if (suspended.length === 0) {
    console.log("✓ No suspended accounts. Safe to turn on real suspension.");
  } else {
    console.log(`⚠ ${suspended.length} account(s) are marked suspended and WILL be locked out once enforcement is live:\n`);
    for (const u of suspended) console.log(`  - ${u.name} <${u.email}> (${u.role}) id=${u._id}`);
  }
  await mongoose.disconnect();
  process.exit(suspended.length === 0 ? 0 : 1);
})().catch((err) => { console.error("Check failed:", err.message); process.exit(2); });
