require("dotenv").config();
const mongoose = require("mongoose");
const Post = require("../src/models/Post");

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const total = await Post.countDocuments({});
  const missing = await Post.countDocuments({ $or: [{ universityId: null }, { universityId: { $exists: false } }] });
  console.log(`Total posts: ${total}`);
  console.log(`Posts missing universityId: ${missing}`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Check failed:", err);
  process.exit(1);
});
