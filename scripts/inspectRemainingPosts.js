require("dotenv").config();
const mongoose = require("mongoose");
const Post = require("../src/models/Post");

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const posts = await Post.find({
    $or: [{ universityId: { $exists: false } }, { universityId: null }],
  }).lean(); // .lean() = raw data, bypasses schema validation entirely — safe to inspect broken documents
  console.log(JSON.stringify(posts, null, 2));
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
