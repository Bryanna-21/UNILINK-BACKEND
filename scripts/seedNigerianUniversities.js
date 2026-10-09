require("dotenv").config();

const mongoose = require("mongoose");
const University = require("../src/models/University");

const universities = [
  // Federal universities
  "Ahmadu Bello University",
  "Bayero University Kano",
  "Federal University of Agriculture, Abeokuta",
  "Federal University of Technology, Akure",
  "Federal University of Technology, Minna",
  "Federal University of Technology, Owerri",
  "Federal University, Dutse",
  "Federal University, Dutsin-Ma",
  "Federal University, Gashua",
  "Federal University, Kashere",
  "Federal University, Lafia",
  "Federal University, Lokoja",
  "Federal University, Otuoke",
  "Federal University, Oye-Ekiti",
  "Federal University, Wukari",
  "Federal University, Birnin Kebbi",
  "Federal University, Gusau",
  "Alex Ekwueme Federal University, Ndufu-Alike",
  "Federal University of Petroleum Resources, Effurun",
  "Federal University of Technology, Babura",
  "Federal University of Health Sciences, Otukpo",
  "Federal University of Health Sciences, Azare",
  "Federal University of Health Sciences, Ila-Orangun",
  "University of Abuja",
  "University of Benin",
  "University of Calabar",
  "University of Ibadan",
  "University of Ilorin",
  "University of Jos",
  "University of Lagos",
  "University of Maiduguri",
  "University of Nigeria, Nsukka",
  "University of Port Harcourt",
  "University of Uyo",
  "Nnamdi Azikiwe University",
  "Obafemi Awolowo University",
  "Usmanu Danfodiyo University",
  "National Open University of Nigeria",
  "Nigerian Defence Academy",
  "Nigeria Police Academy",
  "Air Force Institute of Technology",
  "Nigerian Army University, Biu",
  "Maritime University, Okerenkoko",

  // State universities
  "Abia State University",
  "Adamawa State University",
  "Adekunle Ajasin University",
  "Akwa Ibom State University",
  "Ambrose Alli University",
  "Bauchi State University",
  "Benue State University",
  "Bornu State University",
  "Cross River University of Technology",
  "Delta State University, Abraka",
  "Ebonyi State University",
  "Edo State University, Uzairue",
  "Ekiti State University",
  "Enugu State University of Science and Technology",
  "Gombe State University",
  "Ibrahim Badamasi Babangida University",
  "Ignatius Ajuru University of Education",
  "Imo State University",
  "Kano University of Science and Technology",
  "Kebbi State University of Science and Technology",
  "Kogi State University",
  "Kwara State University",
  "Lagos State University",
  "Nasarawa State University",
  "Niger Delta University",
  "Olabisi Onabanjo University",
  "Ondo State University of Science and Technology",
  "Osun State University",
  "Plateau State University",
  "Rivers State University",
  "Sokoto State University",
  "Tai Solarin University of Education",
  "Taraba State University",
  "Umaru Musa Yar'Adua University",
  "Yobe State University",
  "Zamfara State University",

  // Private universities
  "Afe Babalola University",
  "American University of Nigeria",
  "Anchor University",
  "Babcock University",
  "Baze University",
  "Bells University of Technology",
  "Bowen University",
  "Caleb University",
  "Caritas University",
  "Chrisland University",
  "Covenant University",
  "Crawford University",
  "Edwin Clark University",
  "Elizade University",
  "Evangel University",
  "Fountain University",
  "Godfrey Okoye University",
  "Gregory University",
  "Hallmark University",
  "Hezekiah University",
  "Igbinedion University",
  "Joseph Ayo Babalola University",
  "Kings University",
  "Lead City University",
  "Madonna University",
  "McPherson University",
  "Micheal and Cecilia Ibru University",
  "Mountain Top University",
  "Nile University of Nigeria",
  "Novena University",
  "Obong University",
  "Oduduwa University",
  "Pan-Atlantic University",
  "Paul University",
  "Redeemer's University",
  "Renaissance University",
  "Ritman University",
  "Salem University",
  "Southwestern University",
  "Summit University",
  "Tansian University",
  "Veritas University",
  "Wellspring University",
  "Wesley University",
  "Western Delta University"
];

async function main() {
  if (!process.env.MONGO_URI) {
    throw new Error(
      "MONGO_URI is missing. Check that your local .env file exists."
    );
  }

  await mongoose.connect(process.env.MONGO_URI);

  let added = 0;
  let skipped = 0;
  let failed = 0;

  try {
    for (const name of universities) {
      try {
        const existing = await University.findOne({ name }).collation({
          locale: "en",
          strength: 2
        });

        if (existing) {
          console.log(`SKIP: ${name} (already exists)`);
          skipped++;
          continue;
        }

        await University.create({
          name,
          country: "Nigeria",
          status: "active",
          verified: false
        });

        console.log(`ADDED: ${name}`);
        added++;
      } catch (error) {
        if (error.code === 11000) {
          console.log(`SKIP: ${name} (duplicate name)`);
          skipped++;
        } else {
          console.error(`FAILED: ${name}: ${error.message}`);
          failed++;
        }
      }
    }
  } finally {
    console.log("\n===== SEED SUMMARY =====");
    console.log(`List entries: ${universities.length}`);
    console.log(`Added: ${added}`);
    console.log(`Skipped: ${skipped}`);
    console.log(`Failed: ${failed}`);
    await mongoose.disconnect();
  }

  if (failed > 0) {
    process.exitCode = 1;
  }
}

main().catch(async (error) => {
  console.error("Seed failed:", error.message);
  if (mongoose.connection.readyState !== 0) {
    await mongoose.disconnect();
  }
  process.exitCode = 1;
});
