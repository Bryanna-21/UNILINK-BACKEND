// READ-ONLY. Changes nothing. Explains the accounts that have no university.
// Run from the UNILINK-BACKEND folder:   node scripts/diagnoseNoUniversity.js
// Prints counts only (and the email DOMAIN, never the full address).
require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../src/models/User");

const tally = (rows, key) => {
  const m = new Map();
  for (const r of rows) { const k = key(r); m.set(k, (m.get(k) || 0) + 1); }
  return [...m.entries()].sort((a, b) => b[1] - a[1]);
};
const show = (title, entries) => { console.log(`\n${title}`); for (const [k, n] of entries) console.log(`  ${String(n).padStart(3)}  ${k}`); };

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const all = await User.find({ deletedAt: null }).select("role universityId isVerified createdAt pushToken courseId yearOfStudy onboardingCompletedAt email").lean();
  const none = all.filter((u) => !u.universityId);
  const withUni = all.filter((u) => u.universityId);
  console.log(`Accounts with no university: ${none.length} of ${all.length}`);

  show("By role:", tally(none, (u) => u.role));
  show("Verified their email?", tally(none, (u) => (u.isVerified === false ? "NO (never verified)" : "yes")));
  show("Signed up in month:", tally(none, (u) => (u.createdAt ? new Date(u.createdAt).toISOString().slice(0, 7) : "unknown")).sort());
  show("Has a phone registered for push (they used the app on a phone)?", tally(none, (u) => (u.pushToken ? "yes" : "no")));
  show("Email domain:", tally(none, (u) => String(u.email || "").split("@")[1] || "unknown").slice(0, 8));
  console.log("\nFor comparison, accounts WITH a university:");
  show("Signed up in month:", tally(withUni, (u) => (u.createdAt ? new Date(u.createdAt).toISOString().slice(0, 7) : "unknown")).sort());
  show("Role:", tally(withUni, (u) => u.role));
  await mongoose.disconnect();
}
main().catch((e) => { console.error("Diagnostic failed:", e.message); process.exit(1); });
