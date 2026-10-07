require("dotenv").config();

const mongoose = require("mongoose");

const University = require("../src/models/University");
const User = require("../src/models/User");
const Community = require("../src/models/Community");
const Club = require("../src/models/Club");
const Post = require("../src/models/Post");
const EmergencyReport = require("../src/models/EmergencyReport");

const TEST_UNIVERSITY_ID = "6a9a641bf5ca587aa25b22dd";

/*
 * CUE-approved Kenyan universities.
 *
 * Source:
 * Commission for University Education (CUE)
 * Approved Universities in Kenya.
 *
 * We intentionally exclude:
 * - constituent university colleges
 * - institutions with letters of interim authority
 *
 * Those can be represented separately later if UniLink needs them.
 */
const KENYAN_UNIVERSITIES = [
  // Public Chartered Universities
  "University of Nairobi",
  "Moi University",
  "Kenyatta University",
  "Egerton University",
  "Jomo Kenyatta University of Agriculture and Technology",
  "Maseno University",
  "Masinde Muliro University of Science and Technology",
  "Dedan Kimathi University of Technology",
  "Chuka University",
  "Technical University of Kenya",
  "Technical University of Mombasa",
  "Pwani University",
  "Kisii University",
  "University of Eldoret",
  "Maasai Mara University",
  "Jaramogi Oginga Odinga University of Science and Technology",
  "Laikipia University",
  "South Eastern Kenya University",
  "Meru University of Science and Technology",
  "Multimedia University of Kenya",
  "University of Kabianga",
  "Karatina University",
  "Kibabii University",
  "Rongo University",
  "The Co-operative University of Kenya",
  "Taita Taveta University",
  "Murang'a University of Technology",
  "University of Embu",
  "Machakos University",
  "Kirinyaga University",
  "Garissa University",
  "Alupe University",
  "Kaimosi Friends University",
  "Tom Mboya University",
  "Tharaka University",
  "Bomet University",

  // Private Chartered Universities
  "University of Eastern Africa, Baraton",
  "Catholic University of Eastern Africa (CUEA)",
  "Daystar University",
  "Scott Christian University",
  "United States International University",
  "Africa Nazarene University",
  "Kenya Methodist University",
  "St. Paul's University",
  "Pan Africa Christian University",
  "Strathmore University",
  "Kabarak University",
  "Mount Kenya University",
  "Africa International University",
  "Kenya Highlands Evangelical University",
  "Great Lakes University of Kisumu",
  "KCA University",
  "Adventist University of Africa",
  "KAG EAST University",
  "Umma University",
  "Presbyterian University of East Africa",
  "Aga Khan University",
  "Kiriri Women's University of Science and Technology",
  "The East African University",
  "Zetech University",
  "Lukenya University",
  "Management University of Africa",
  "Tangaza University",
  "Islamic University of Kenya",
  "Riara University",
  "Uzima University",
  "Gretsa University",
  "Amref International University",

  // Specialized Public Degree-Awarding Universities
  "National Defence University-Kenya",
  "Open University of Kenya",
  "National Intelligence Research University",
  "Kenya Advanced Institute of Science and Technology",
  "Kenya Medical Research Institute",
];

const UNIVERSITY_NAMES = [...new Set(KENYAN_UNIVERSITIES)];

async function deleteByUniversityId(Model, name) {
  const filters = [
    { universityId: TEST_UNIVERSITY_ID },
  ];

  let deleted = 0;

  for (const filter of filters) {
    try {
      const result = await Model.deleteMany(filter);
      deleted += result.deletedCount || 0;
    } catch (error) {
      console.warn(
        `${name}: unable to clean records: ${error.message}`
      );
    }
  }

  return deleted;
}

async function removeTestUniversity() {
  console.log("\n===== REMOVING TEST UNIVERSITY =====");

  const models = [
    ["User", User],
    ["Community", Community],
    ["Club", Club],
    ["Post", Post],
    ["EmergencyReport", EmergencyReport],
  ];

  for (const [name, Model] of models) {
    const deleted = await deleteByUniversityId(Model, name);
    console.log(`${name.padEnd(20)} deleted: ${deleted}`);
  }

  const university = await University.findById(TEST_UNIVERSITY_ID);

  if (university) {
    await University.deleteOne({ _id: TEST_UNIVERSITY_ID });
    console.log("Test University       deleted: 1");
  } else {
    console.log("Test University       deleted: 0");
  }
}

async function seedUniversities() {
  console.log("\n===== SEEDING KENYAN UNIVERSITIES =====");

  let created = 0;
  let existing = 0;

  for (const name of UNIVERSITY_NAMES) {
    const existingUniversity = await University.findOne({
      name,
    });

    if (existingUniversity) {
      existing++;
      continue;
    }

    await University.create({
      name,
      country: "Kenya",
      status: "active",
      verified: false,
    });

    created++;
    console.log(`Created: ${name}`);
  }

  console.log("\n===== SEED SUMMARY =====");
  console.log(`Source entries: ${UNIVERSITY_NAMES.length}`);
  console.log(`Created:        ${created}`);
  console.log(`Existing:       ${existing}`);
}

async function verifyDirectory() {
  const universities = await University.find({
    country: "Kenya",
  })
    .select("_id name country status verified")
    .sort({ name: 1 })
    .lean();

  console.log("\n===== KENYA UNIVERSITY DIRECTORY =====");
  console.log(`Total: ${universities.length}\n`);

  universities.forEach((university, index) => {
    console.log(
      `${String(index + 1).padStart(2, "0")}. ${university.name} | ${university._id}`
    );
  });

  console.log("\n=======================================\n");
}

(async () => {
  try {
    await mongoose.connect(process.env.MONGO_URI);

    await removeTestUniversity();
    await seedUniversities();
    await verifyDirectory();

    console.log("===== SEED COMPLETE =====");
  } catch (error) {
    console.error("\nSEED FAILED:", error);
    process.exitCode = 1;
  } finally {
    await mongoose.disconnect();
  }
})();
