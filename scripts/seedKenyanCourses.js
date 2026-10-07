"use strict";

require("dotenv").config();

const mongoose = require("mongoose");
const University = require("../src/models/University");
const Course = require("../src/models/Course");

/*
 * UniLink starter programme catalogue.
 *
 * This seed is intentionally additive:
 * - Never deletes courses.
 * - Never overwrites existing courses.
 * - Uses university names instead of hard-coded Mongo IDs.
 * - Safe to run repeatedly.
 *
 * These are starter programmes for onboarding. The catalogue can be
 * expanded later with institution-specific official programme lists.
 */

const COMMON = {
  computing: [
    ["Bachelor of Science in Computer Science", "BSc-CS"],
    ["Bachelor of Science in Information Technology", "BSc-IT"],
    ["Bachelor of Science in Software Engineering", "BSc-SE"],
    ["Bachelor of Science in Information Systems", "BSc-IS"],
    ["Bachelor of Science in Data Science", "BSc-DS"],
    ["Bachelor of Science in Cyber Security", "BSc-CY"],
    ["Bachelor of Business Information Technology", "BBIT"],
  ],

  business: [
    ["Bachelor of Commerce", "BCOM"],
    ["Bachelor of Business Administration", "BBA"],
    ["Bachelor of Business Management", "BBM"],
    ["Bachelor of Science in Finance", "BSc-FIN"],
    ["Bachelor of Science in Economics", "BSc-ECON"],
    ["Bachelor of Science in Actuarial Science", "BSc-ACT"],
    ["Bachelor of Procurement and Logistics Management", "BPLM"],
    ["Bachelor of Marketing", "BMKT"],
  ],

  social: [
    ["Bachelor of Arts", "BA"],
    ["Bachelor of Arts in Economics", "BA-ECON"],
    ["Bachelor of Arts in Psychology", "BA-PSY"],
    ["Bachelor of Arts in Sociology", "BA-SOC"],
    ["Bachelor of Arts in Political Science", "BA-POL"],
    ["Bachelor of Arts in International Relations", "BA-IR"],
    ["Bachelor of Arts in Communication", "BA-COM"],
    ["Bachelor of Arts in Journalism", "BA-JOUR"],
  ],

  education: [
    ["Bachelor of Education (Arts)", "BED-ARTS"],
    ["Bachelor of Education (Science)", "BED-SCI"],
    ["Bachelor of Education (Early Childhood Development)", "BECD"],
    ["Bachelor of Education (Special Needs Education)", "BESNE"],
    ["Bachelor of Education (Primary Education)", "BED-PRI"],
  ],

  science: [
    ["Bachelor of Science", "BSc"],
    ["Bachelor of Science in Mathematics", "BSc-MATH"],
    ["Bachelor of Science in Statistics", "BSc-STAT"],
    ["Bachelor of Science in Biology", "BSc-BIO"],
    ["Bachelor of Science in Biochemistry", "BSc-BCH"],
    ["Bachelor of Science in Chemistry", "BSc-CHEM"],
    ["Bachelor of Science in Physics", "BSc-PHY"],
    ["Bachelor of Science in Environmental Science", "BSc-ENV"],
  ],

  agriculture: [
    ["Bachelor of Science in Agriculture", "BSc-AGR"],
    ["Bachelor of Science in Agribusiness Management", "BSc-ABM"],
    ["Bachelor of Science in Agricultural Economics", "BSc-AEC"],
    ["Bachelor of Science in Food Science and Technology", "BSc-FST"],
    ["Bachelor of Science in Horticulture", "BSc-HORT"],
    ["Bachelor of Science in Animal Science", "BSc-ANS"],
    ["Bachelor of Science in Natural Resource Management", "BSc-NRM"],
  ],

  health: [
    ["Bachelor of Medicine and Bachelor of Surgery", "MBChB"],
    ["Bachelor of Science in Nursing", "BSc-NURS"],
    ["Bachelor of Science in Public Health", "BSc-PH"],
    ["Bachelor of Pharmacy", "BPharm"],
    ["Bachelor of Science in Medical Laboratory Sciences", "BSc-MLS"],
    ["Bachelor of Science in Clinical Medicine", "BSc-CM"],
    ["Bachelor of Science in Nutrition and Dietetics", "BSc-ND"],
  ],

  law: [
    ["Bachelor of Laws", "LLB"],
  ],

  engineering: [
    ["Bachelor of Science in Civil Engineering", "BSc-CIV"],
    ["Bachelor of Science in Electrical and Electronic Engineering", "BSc-EEE"],
    ["Bachelor of Science in Mechanical Engineering", "BSc-MECH"],
    ["Bachelor of Science in Computer Engineering", "BSc-CE"],
    ["Bachelor of Science in Mechatronic Engineering", "BSc-MECHT"],
    ["Bachelor of Science in Telecommunications Engineering", "BSc-TEL"],
  ],

  built: [
    ["Bachelor of Architecture", "BArch"],
    ["Bachelor of Quantity Surveying", "BQS"],
    ["Bachelor of Real Estate", "BRES"],
    ["Bachelor of Construction Management", "BCM"],
    ["Bachelor of Urban and Regional Planning", "BURP"],
  ],

  hospitality: [
    ["Bachelor of Science in Hospitality Management", "BSc-HM"],
    ["Bachelor of Science in Tourism Management", "BSc-TM"],
    ["Bachelor of Hotel and Hospitality Management", "BHHM"],
  ],
};

function merge(...groups) {
  const result = [];
  const seen = new Set();

  for (const group of groups) {
    for (const course of group) {
      const code = course[1];

      if (!seen.has(code)) {
        seen.add(code);
        result.push(course);
      }
    }
  }

  return result;
}

/*
 * University-specific starter catalogues.
 *
 * The common sets are intentionally conservative. Universities that
 * have stronger known coverage receive additional programme families.
 */

const UNIVERSITY_CATALOGUES = {
  "Bomet University": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.education,
    COMMON.science,
    COMMON.agriculture,
    COMMON.social
  ),

  "National Intelligence Research University": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.social,
    COMMON.science
  ),

  "Pwani University": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.education,
    COMMON.science,
    COMMON.agriculture,
    COMMON.social,
    COMMON.hospitality
  ),

  "Scott Christian University": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.social,
    COMMON.education
  ),

  "University of Eastern Africa, Baraton": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.education,
    COMMON.science,
    COMMON.health,
    COMMON.social
  ),

  "University of Nairobi": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.social,
    COMMON.education,
    COMMON.science,
    COMMON.health,
    COMMON.law,
    COMMON.engineering,
    COMMON.built,
    COMMON.agriculture
  ),

  "Kenyatta University": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.social,
    COMMON.education,
    COMMON.science,
    COMMON.health,
    COMMON.law,
    COMMON.engineering,
    COMMON.built
  ),

  "Jomo Kenyatta University of Agriculture and Technology": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.science,
    COMMON.agriculture,
    COMMON.engineering,
    COMMON.built,
    COMMON.social
  ),

  "Moi University": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.social,
    COMMON.education,
    COMMON.science,
    COMMON.health,
    COMMON.law,
    COMMON.engineering,
    COMMON.agriculture
  ),

  "Egerton University": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.education,
    COMMON.science,
    COMMON.agriculture,
    COMMON.social,
    COMMON.health,
    COMMON.engineering
  ),

  "Maseno University": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.social,
    COMMON.education,
    COMMON.science,
    COMMON.health,
    COMMON.law,
    COMMON.engineering,
    COMMON.agriculture
  ),

  "Masinde Muliro University of Science and Technology": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.science,
    COMMON.education,
    COMMON.engineering,
    COMMON.health,
    COMMON.social
  ),

  "Dedan Kimathi University of Technology": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.science,
    COMMON.engineering,
    COMMON.built,
    COMMON.social
  ),

  "Technical University of Kenya": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.engineering,
    COMMON.built,
    COMMON.science,
    COMMON.social
  ),

  "Technical University of Mombasa": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.engineering,
    COMMON.hospitality,
    COMMON.science,
    COMMON.social
  ),

  "University of Eldoret": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.education,
    COMMON.science,
    COMMON.agriculture,
    COMMON.social,
    COMMON.health
  ),

  "University of Kabianga": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.education,
    COMMON.science,
    COMMON.agriculture,
    COMMON.social
  ),

  "Kabarak University": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.social,
    COMMON.education,
    COMMON.science,
    COMMON.health,
    COMMON.law
  ),

  "Mount Kenya University": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.social,
    COMMON.education,
    COMMON.science,
    COMMON.health,
    COMMON.law
  ),

  "Strathmore University": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.social,
    COMMON.law
  ),

  "KCA University": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.social,
    COMMON.law
  ),

  "United States International University": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.social
  ),

  "Africa Nazarene University": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.social,
    COMMON.education,
    COMMON.law
  ),

  "Kenya Methodist University": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.social,
    COMMON.education,
    COMMON.science,
    COMMON.health
  ),

  "Catholic University of Eastern Africa (CUEA)": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.social,
    COMMON.education,
    COMMON.science,
    COMMON.law
  ),

  "Daystar University": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.social,
    COMMON.communication || []
  ),

  "St. Paul's University": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.social,
    COMMON.education
  ),

  "Pan Africa Christian University": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.social,
    COMMON.education
  ),

  "Africa International University": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.social,
    COMMON.education
  ),

  "Kenya Highlands Evangelical University": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.social,
    COMMON.education,
    COMMON.science
  ),

  "Great Lakes University of Kisumu": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.social,
    COMMON.health
  ),

  "Multimedia University of Kenya": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.science,
    COMMON.engineering,
    COMMON.social
  ),

  "Meru University of Science and Technology": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.science,
    COMMON.agriculture,
    COMMON.engineering,
    COMMON.social
  ),

  "Chuka University": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.education,
    COMMON.science,
    COMMON.agriculture,
    COMMON.social
  ),

  "Kisii University": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.education,
    COMMON.science,
    COMMON.health,
    COMMON.agriculture,
    COMMON.social
  ),

  "Maasai Mara University": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.education,
    COMMON.science,
    COMMON.agriculture,
    COMMON.social,
    COMMON.hospitality
  ),

  "Jaramogi Oginga Odinga University of Science and Technology": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.science,
    COMMON.agriculture,
    COMMON.education,
    COMMON.social,
    COMMON.health
  ),

  "Laikipia University": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.education,
    COMMON.science,
    COMMON.agriculture,
    COMMON.social
  ),

  "South Eastern Kenya University": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.education,
    COMMON.science,
    COMMON.agriculture,
    COMMON.social,
    COMMON.engineering
  ),

  "Karatina University": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.education,
    COMMON.science,
    COMMON.agriculture,
    COMMON.social
  ),

  "Kibabii University": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.education,
    COMMON.science,
    COMMON.social,
    COMMON.agriculture
  ),

  "Rongo University": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.education,
    COMMON.science,
    COMMON.agriculture,
    COMMON.social
  ),

  "The Co-operative University of Kenya": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.social
  ),

  "Taita Taveta University": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.science,
    COMMON.engineering,
    COMMON.agriculture
  ),

  "Murang'a University of Technology": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.science,
    COMMON.engineering,
    COMMON.social
  ),

  "University of Embu": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.education,
    COMMON.science,
    COMMON.agriculture,
    COMMON.social
  ),

  "Machakos University": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.education,
    COMMON.science,
    COMMON.engineering,
    COMMON.social
  ),

  "Kirinyaga University": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.science,
    COMMON.business,
    COMMON.social
  ),

  "Garissa University": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.education,
    COMMON.social,
    COMMON.science
  ),

  "Alupe University": merge(
    COMMON.science,
    COMMON.health,
    COMMON.computing,
    COMMON.business,
    COMMON.social
  ),

  "Kaimosi Friends University": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.education,
    COMMON.science,
    COMMON.social,
    COMMON.health
  ),

  "Tom Mboya University": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.education,
    COMMON.science,
    COMMON.social,
    COMMON.agriculture
  ),

  "Tharaka University": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.education,
    COMMON.science,
    COMMON.agriculture,
    COMMON.social
  ),

  "KAG EAST University": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.social,
    COMMON.education
  ),

  "Umma University": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.social,
    COMMON.education
  ),

  "Presbyterian University of East Africa": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.social,
    COMMON.education
  ),

  "Zetech University": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.social,
    COMMON.education
  ),

  "Riara University": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.social,
    COMMON.education,
    COMMON.law
  ),

  "Uzima University": merge(
    COMMON.health,
    COMMON.science
  ),

  "Amref International University": merge(
    COMMON.health,
    COMMON.science
  ),

  "Adventist University of Africa": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.social,
    COMMON.education
  ),

  "Tangaza University": merge(
    COMMON.social,
    COMMON.education,
    COMMON.business
  ),

  "Islamic University of Kenya": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.social,
    COMMON.education
  ),

  "Management University of Africa": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.social
  ),

  "Lukenya University": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.social,
    COMMON.education
  ),

  "The East African University": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.social,
    COMMON.education
  ),

  "Gretsa University": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.social,
    COMMON.education,
    COMMON.health
  ),

  "Kiriri Women's University of Science and Technology": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.science,
    COMMON.social
  ),

  "Aga Khan University": merge(
    COMMON.health,
    COMMON.education,
    COMMON.social
  ),

  "Kenya Advanced Institute of Science and Technology": merge(
    COMMON.computing,
    COMMON.science,
    COMMON.engineering
  ),

  "National Defence University-Kenya": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.social,
    COMMON.science
  ),

  "Open University of Kenya": merge(
    COMMON.computing,
    COMMON.business,
    COMMON.social,
    COMMON.education
  ),

  "Kenya Medical Research Institute": merge(
    COMMON.health,
    COMMON.science
  ),
};

async function main() {
  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not configured.");
  }

  await mongoose.connect(process.env.MONGO_URI);

  console.log("===== UNILINK KENYAN COURSE SEED =====");

  const universities = await University.find({})
    .select("_id name")
    .lean();

  console.log(`Universities in database: ${universities.length}`);
  console.log(
    `Configured universities: ${Object.keys(UNIVERSITY_CATALOGUES).length}`
  );

  const universityMap = new Map(
    universities.map((university) => [
      university.name,
      String(university._id),
    ])
  );

  const universityIds = Array.from(universityMap.values());

  const existingCourses = await Course.find({
    universityId: { $in: universityIds },
  })
    .select("universityId code")
    .lean();

  const existingKeys = new Set(
    existingCourses.map(
      (course) => `${String(course.universityId)}::${String(course.code)}`
    )
  );

  let requested = 0;
  let created = 0;
  let existing = 0;
  let skippedUniversities = 0;

  const operations = [];

  for (const [name, courses] of Object.entries(UNIVERSITY_CATALOGUES)) {
    const universityId = universityMap.get(name);

    if (!universityId) {
      console.log(`SKIP: ${name} (university not found)`);
      skippedUniversities += 1;
      continue;
    }

    console.log(`\n${name}: ${courses.length} starter programmes`);

    for (const [title, code] of courses) {
      requested += 1;

      const key = `${universityId}::${code}`;

      if (existingKeys.has(key)) {
        existing += 1;
        continue;
      }

      operations.push({
        insertOne: {
          document: {
            title,
            code,
            universityId,
            description: `${title} programme at ${name}.`,
            enrolledStudentIds: [],
            unitIds: [],
          },
        },
      });

      existingKeys.add(key);
    }
  }

  console.log(`\nRequested starter programmes: ${requested}`);
  console.log(`Already existed: ${existing}`);
  console.log(`To create: ${operations.length}`);

  const CHUNK_SIZE = 250;

  for (let i = 0; i < operations.length; i += CHUNK_SIZE) {
    const chunk = operations.slice(i, i + CHUNK_SIZE);

    const upserts = chunk.map((operation) => ({
      updateOne: {
        filter: {
          universityId: operation.insertOne.document.universityId,
          code: operation.insertOne.document.code,
        },
        update: {
          $setOnInsert: operation.insertOne.document,
        },
        upsert: true,
      },
    }));

    const result = await Course.bulkWrite(upserts, {
      ordered: false,
    });

    const inserted = result.upsertedCount || 0;
    created += inserted;

    console.log(
      `  Inserted ${inserted} courses (${Math.min(
        i + chunk.length,
        operations.length
      )}/${operations.length})`
    );
  }

  console.log("\n===== COURSE SEED SUMMARY =====");
  console.log(`Created: ${created}`);
  console.log(`Already existed: ${existing}`);
  console.log(`Universities skipped: ${skippedUniversities}`);
  console.log(`Configured universities: ${Object.keys(UNIVERSITY_CATALOGUES).length}`);
  console.log("Seed completed safely.");
}

main()
  .catch((error) => {
    console.error("\nCOURSE SEED FAILED");
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
