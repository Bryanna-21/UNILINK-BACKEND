// READ-ONLY. Changes nothing. Explains why people cannot find each other and why feeds look empty.
// Run from the UNILINK-BACKEND folder:   node scripts/diagnoseDiscovery.js
// (copy this file into scripts/ first). Prints counts only: no names, emails or post text.
require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../src/models/User");
const Post = require("../src/models/Post");
const Follow = require("../src/models/Follow");
const University = require("../src/models/University");

const DAY = 86400 * 1000;

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const [users, universities, posts, follows] = await Promise.all([
    User.find({ deletedAt: null }).select("role status universityId username isVerified createdAt").lean(),
    University.find({}).select("name").lean(),
    Post.find({}).select("userId universityId communityId createdAt").lean(),
    Follow.countDocuments({}),
  ]);
  const uniName = new Map(universities.map((u) => [String(u._id), u.name]));
  const now = Date.now();

  console.log("\n=== WHOLE APP ===");
  console.log(`Accounts (not deleted): ${users.length}`);
  console.log(`  without a university:        ${users.filter((u) => !u.universityId).length}   <- invisible to search, suggestions and the feed`);
  console.log(`  without a username:          ${users.filter((u) => typeof u.username !== "string").length}   <- cannot be found by search, never suggested`);
  console.log(`  not verified (isVerified false): ${users.filter((u) => u.isVerified === false).length}   <- hidden from search and suggestions`);
  console.log(`  suspended or closed:         ${users.filter((u) => u.status === "suspended" || u.status === "terminated").length}`);
  console.log(`Posts: ${posts.length}   Follow links: ${follows}`);

  const posters7 = new Set(posts.filter((p) => now - new Date(p.createdAt) < 7 * DAY).map((p) => String(p.userId)));
  console.log(`Different people who posted in the last 7 days: ${posters7.size}`);
  const everPosted = new Set(posts.map((p) => String(p.userId)));
  console.log(`Accounts that have never posted: ${users.filter((u) => !everPosted.has(String(u._id))).length}`);

  console.log("\n=== PER UNIVERSITY (people only see their OWN university) ===");
  const rows = new Map();
  const row = (id) => {
    const k = id ? String(id) : "(none)";
    if (!rows.has(k)) rows.set(k, { users: 0, noUsername: 0, posts: 0, posts7: 0, posters7: new Set() });
    return rows.get(k);
  };
  for (const u of users) {
    const r = row(u.universityId);
    r.users++;
    if (typeof u.username !== "string") r.noUsername++;
  }
  for (const p of posts) {
    if (p.communityId) continue;
    const r = row(p.universityId);
    r.posts++;
    if (now - new Date(p.createdAt) < 7 * DAY) { r.posts7++; r.posters7.add(String(p.userId)); }
  }
  const sorted = [...rows.entries()].sort((a, b) => b[1].users - a[1].users);
  console.log("users | no username | main-feed posts | posts in 7 days | posters in 7 days | university");
  for (const [id, r] of sorted) {
    console.log(`${String(r.users).padStart(5)} | ${String(r.noUsername).padStart(11)} | ${String(r.posts).padStart(15)} | ${String(r.posts7).padStart(15)} | ${String(r.posters7.size).padStart(17)} | ${uniName.get(id) || id}`);
  }
  console.log("\nHow to read this: a student only ever sees people and posts from their own university.");
  console.log("A university with 3 users has a feed and a people list of 3. That, not a missing feature, is usually the whole problem.\n");
  await mongoose.disconnect();
}

main().catch((e) => { console.error("Diagnostic failed:", e.message); process.exit(1); });
