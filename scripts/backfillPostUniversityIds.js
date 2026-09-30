require("dotenv").config();
const mongoose = require("mongoose");
const Post = require("../src/models/Post");
const User = require("../src/models/User");

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to database.");

  const posts = await Post.find({
    $or: [{ universityId: { $exists: false } }, { universityId: null }],
  });
  console.log(`Found ${posts.length} posts needing backfill.`);

  let updated = 0;
  let skipped = 0;

  for (const post of posts) {
    const author = await User.findById(post.userId).select("universityId");
    if (!author?.universityId) {
      console.log(`Skipping post ${post._id} — author ${post.userId} has no universityId.`);
      skipped++;
      continue;
    }
    post.universityId = author.universityId;
    await post.save();
    updated++;
  }

  console.log(`Done. Updated: ${updated}, Skipped: ${skipped}.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
