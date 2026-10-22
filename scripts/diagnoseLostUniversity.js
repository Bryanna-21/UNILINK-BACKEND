// READ-ONLY. Changes nothing. Tells apart two very different problems:
//   "never had a university"  vs  "had one and lost it" (an admin edit or a script).
// A student with a campus, course or year but NO university must have had a university once,
// because the app only offers campuses and courses after a university is chosen.
// Run from the UNILINK-BACKEND folder:   node scripts/diagnoseLostUniversity.js
// One line per account: no names, no emails.
require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../src/models/User");

const yn = (v) => (v ? "yes" : "no ");

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const rows = await User.find({ deletedAt: null, universityId: { $in: [null, undefined] }, role: "student" })
    .select("createdAt updatedAt isVerified campusId courseId yearOfStudy onboardingCompletedAt username")
    .sort({ createdAt: 1 })
    .lean();
  console.log(`Students with no university: ${rows.length}\n`);
  console.log("signed up  | last changed | verified | campus | course | year | onboarded | username");
  let hadOne = 0;
  for (const r of rows) {
    if (r.campusId || r.courseId || r.yearOfStudy || r.onboardingCompletedAt) hadOne++;
    const d = (v) => (v ? new Date(v).toISOString().slice(0, 10) : "unknown   ");
    console.log(`${d(r.createdAt)} | ${d(r.updatedAt)}   | ${yn(r.isVerified !== false)}      | ${yn(r.campusId)}    | ${yn(r.courseId)}    | ${yn(r.yearOfStudy)}  | ${yn(r.onboardingCompletedAt)}       | ${yn(typeof r.username === "string")}`);
  }
  console.log(`\n${hadOne} of ${rows.length} have a campus, course, year or finished onboarding, so they HAD a university once and LOST it.`);
  console.log(`${rows.length - hadOne} of ${rows.length} look like they never had one.\n`);
  await mongoose.disconnect();
}
main().catch((e) => { console.error("Diagnostic failed:", e.message); process.exit(1); });
