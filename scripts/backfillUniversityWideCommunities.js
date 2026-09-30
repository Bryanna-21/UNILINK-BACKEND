require("dotenv").config();
const mongoose = require("mongoose");
const University = require("../src/models/University");
const Community = require("../src/models/Community");

async function main() {
  await mongoose.connect(process.env.MONGO_URI);
  const universities = await University.find({});
  console.log(`Found ${universities.length} universities.`);

  for (const uni of universities) {
    const existing = await Community.findOne({ universityId: uni._id.toString(), type: "university-wide" });
    if (existing) {
      console.log(`Skipping ${uni.name} — already has a university-wide community.`);
      continue;
    }
    await Community.create({
      universityId: uni._id.toString(),
      name: `${uni.name} Community`,
      type: "university-wide",
      description: `The official campus-wide community for ${uni.name}.`,
      isPublic: true,
      createdBy: null,
    });
    console.log(`Created university-wide community for ${uni.name}.`);
  }

  await mongoose.disconnect();
  console.log("Done.");
}

main().catch((err) => {
  console.error("Backfill failed:", err);
  process.exit(1);
});
