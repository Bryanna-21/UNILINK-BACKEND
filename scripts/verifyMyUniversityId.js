require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../src/models/User");

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const user = await User.findById("6a6e2fd0401ed095722f8000").select("universityId role");
  console.log(JSON.stringify(user, null, 2));
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
