// Starter posts for the UniLink feed: 200 posts from ten labelled UniLink accounts, all "for everyone".
//
//   node scripts/seedPosts.js                       dry run: shows what would be created, writes nothing
//   SEED_POSTS_CONFIRM=yes-seed-200-posts node scripts/seedPosts.js --apply
//   SEED_POSTS_CONFIRM=yes-remove-seed-posts node scripts/seedPosts.js --remove
//   add  --university <universityId>  to attach them to a university (default: the one with most students)
//
// Safe to re-run: posts that already exist are skipped. Everything it creates is flagged isSeed and can be removed
// with --remove. --apply or --remove without the exact confirmation text does nothing.

require("dotenv").config();
const mongoose = require("mongoose");
const bcryptjs = require("bcryptjs");
const User = require("../src/models/User");
const Post = require("../src/models/Post");
const Comment = require("../src/models/Comment");
const Like = require("../src/models/Like");
const HiddenPost = require("../src/models/HiddenPost");
const UserNotification = require("../src/models/UserNotification");
const Follow = require("../src/models/Follow");
const { CHANNELS } = require("./data/seedPosts.data");
const { buildSeedPlan, validatePlan } = require("../src/utils/seedPosts.rules");
const service = require("../src/services/seedPosts.service");

const APPLY_TEXT = "yes-seed-200-posts";
const REMOVE_TEXT = "yes-remove-seed-posts";

async function busiestUniversity() {
  const rows = await User.aggregate([
    { $match: { universityId: { $type: "string", $ne: "" }, isSeed: { $ne: true } } },
    { $group: { _id: "$universityId", n: { $sum: 1 } } },
    { $sort: { n: -1 } },
    { $limit: 1 },
  ]);
  return rows[0]?._id || null;
}

async function main() {
  const args = process.argv.slice(2);
  const apply = args.includes("--apply");
  const remove = args.includes("--remove");
  const uniArg = args.includes("--university") ? args[args.indexOf("--university") + 1] : null;
  const confirm = process.env.SEED_POSTS_CONFIRM || "";

  if (!process.env.MONGO_URI) {
    console.error("MONGO_URI is not set.");
    process.exit(1);
  }
  await mongoose.connect(process.env.MONGO_URI);
  const models = { User, Post, Comment, Like, HiddenPost, UserNotification, Follow };

  if (remove) {
    if (confirm !== REMOVE_TEXT) {
      console.log(`Not removing. To remove every seeded account and post, run:\n  SEED_POSTS_CONFIRM=${REMOVE_TEXT} node scripts/seedPosts.js --remove`);
    } else {
      console.log("Removed:", await service.removeSeed(models));
    }
    await mongoose.disconnect();
    return;
  }

  const plan = buildSeedPlan({ channels: CHANNELS });
  const problems = validatePlan(plan);
  if (problems.length) {
    console.error("The seed data has problems, nothing was written:\n  - " + problems.join("\n  - "));
    process.exit(1);
  }

  const universityId = uniArg || (await busiestUniversity());
  const todo = await service.planSeed(models, plan);
  console.log(`University: ${universityId || "(none found)"}`);
  console.log(`Accounts: ${todo.accountsToCreate.length} to create, ${todo.accountsPresent} already there`);
  console.log(`Posts:    ${todo.postsToCreate.length} to create, ${todo.postsPresent} already there`);

  if (!apply) {
    console.log("\nDry run. Nothing was written.");
  } else if (confirm !== APPLY_TEXT) {
    console.log(`\nNot writing. To create them, run:\n  SEED_POSTS_CONFIRM=${APPLY_TEXT} node scripts/seedPosts.js --apply`);
  } else {
    console.log("\nCreated:", await service.applySeed({ ...models, hashPassword: (p) => bcryptjs.hash(p, 10) }, plan, { universityId }));
  }
  await mongoose.disconnect();
}

main().catch(async (err) => {
  console.error(err);
  try { await mongoose.disconnect(); } catch { /* ignore */ }
  process.exit(1);
});
