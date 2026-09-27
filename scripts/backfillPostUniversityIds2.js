require("dotenv").config();
const mongoose = require("mongoose");
const Post = require("../src/models/Post");
const User = require("../src/models/User");

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to database.");

  const posts = await Post.find({
    $or: [{ universityId: { $exists: false } }, { universityId: null }],
  }).lean();
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
    // updateOne + $set touches ONLY universityId — does not
    // re-validate the whole document (unlike .save()), so this works
    // correctly on legacy posts missing a title from before that
    // field was made required.
    await Post.updateOne({ _id: post._id }, { $set: { universityId: author.universityId } });
    updated++;
  }

  console.log(`Done. Updated: ${updated}, Skipped: ${skipped}.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
