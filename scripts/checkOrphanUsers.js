require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../src/models/User");

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const ids = ["6a6e2fd0401ed095722f8000", "6a8d78ecb9a18ddcfba0108c"];
  for (const id of ids) {
    const user = await User.findById(id).select("name email role universityId isVerified createdAt");
    console.log(JSON.stringify(user, null, 2));
  }
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Check failed:", err);
  process.exit(1);
});
