require("dotenv").config();
const mongoose = require("mongoose");
const Post = require("../src/models/Post");

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const post = await Post.findById("6a8d794bb9a18ddcfba01097").lean();
  console.log(JSON.stringify(post, null, 2));
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Check failed:", err);
  process.exit(1);
});
