require("dotenv").config();
const mongoose = require("mongoose");
const User = require("../src/models/User");

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const result = await User.updateOne(
    { _id: "6a6e2fd0401ed095722f8000" },
    { $set: { universityId: "6a9feb3a0bbeb2aa2195424c" } } // KABIANGA UNIVERSITY
  );
  console.log("Matched:", result.matchedCount, "Modified:", result.modifiedCount);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("Failed:", err);
  process.exit(1);
});
