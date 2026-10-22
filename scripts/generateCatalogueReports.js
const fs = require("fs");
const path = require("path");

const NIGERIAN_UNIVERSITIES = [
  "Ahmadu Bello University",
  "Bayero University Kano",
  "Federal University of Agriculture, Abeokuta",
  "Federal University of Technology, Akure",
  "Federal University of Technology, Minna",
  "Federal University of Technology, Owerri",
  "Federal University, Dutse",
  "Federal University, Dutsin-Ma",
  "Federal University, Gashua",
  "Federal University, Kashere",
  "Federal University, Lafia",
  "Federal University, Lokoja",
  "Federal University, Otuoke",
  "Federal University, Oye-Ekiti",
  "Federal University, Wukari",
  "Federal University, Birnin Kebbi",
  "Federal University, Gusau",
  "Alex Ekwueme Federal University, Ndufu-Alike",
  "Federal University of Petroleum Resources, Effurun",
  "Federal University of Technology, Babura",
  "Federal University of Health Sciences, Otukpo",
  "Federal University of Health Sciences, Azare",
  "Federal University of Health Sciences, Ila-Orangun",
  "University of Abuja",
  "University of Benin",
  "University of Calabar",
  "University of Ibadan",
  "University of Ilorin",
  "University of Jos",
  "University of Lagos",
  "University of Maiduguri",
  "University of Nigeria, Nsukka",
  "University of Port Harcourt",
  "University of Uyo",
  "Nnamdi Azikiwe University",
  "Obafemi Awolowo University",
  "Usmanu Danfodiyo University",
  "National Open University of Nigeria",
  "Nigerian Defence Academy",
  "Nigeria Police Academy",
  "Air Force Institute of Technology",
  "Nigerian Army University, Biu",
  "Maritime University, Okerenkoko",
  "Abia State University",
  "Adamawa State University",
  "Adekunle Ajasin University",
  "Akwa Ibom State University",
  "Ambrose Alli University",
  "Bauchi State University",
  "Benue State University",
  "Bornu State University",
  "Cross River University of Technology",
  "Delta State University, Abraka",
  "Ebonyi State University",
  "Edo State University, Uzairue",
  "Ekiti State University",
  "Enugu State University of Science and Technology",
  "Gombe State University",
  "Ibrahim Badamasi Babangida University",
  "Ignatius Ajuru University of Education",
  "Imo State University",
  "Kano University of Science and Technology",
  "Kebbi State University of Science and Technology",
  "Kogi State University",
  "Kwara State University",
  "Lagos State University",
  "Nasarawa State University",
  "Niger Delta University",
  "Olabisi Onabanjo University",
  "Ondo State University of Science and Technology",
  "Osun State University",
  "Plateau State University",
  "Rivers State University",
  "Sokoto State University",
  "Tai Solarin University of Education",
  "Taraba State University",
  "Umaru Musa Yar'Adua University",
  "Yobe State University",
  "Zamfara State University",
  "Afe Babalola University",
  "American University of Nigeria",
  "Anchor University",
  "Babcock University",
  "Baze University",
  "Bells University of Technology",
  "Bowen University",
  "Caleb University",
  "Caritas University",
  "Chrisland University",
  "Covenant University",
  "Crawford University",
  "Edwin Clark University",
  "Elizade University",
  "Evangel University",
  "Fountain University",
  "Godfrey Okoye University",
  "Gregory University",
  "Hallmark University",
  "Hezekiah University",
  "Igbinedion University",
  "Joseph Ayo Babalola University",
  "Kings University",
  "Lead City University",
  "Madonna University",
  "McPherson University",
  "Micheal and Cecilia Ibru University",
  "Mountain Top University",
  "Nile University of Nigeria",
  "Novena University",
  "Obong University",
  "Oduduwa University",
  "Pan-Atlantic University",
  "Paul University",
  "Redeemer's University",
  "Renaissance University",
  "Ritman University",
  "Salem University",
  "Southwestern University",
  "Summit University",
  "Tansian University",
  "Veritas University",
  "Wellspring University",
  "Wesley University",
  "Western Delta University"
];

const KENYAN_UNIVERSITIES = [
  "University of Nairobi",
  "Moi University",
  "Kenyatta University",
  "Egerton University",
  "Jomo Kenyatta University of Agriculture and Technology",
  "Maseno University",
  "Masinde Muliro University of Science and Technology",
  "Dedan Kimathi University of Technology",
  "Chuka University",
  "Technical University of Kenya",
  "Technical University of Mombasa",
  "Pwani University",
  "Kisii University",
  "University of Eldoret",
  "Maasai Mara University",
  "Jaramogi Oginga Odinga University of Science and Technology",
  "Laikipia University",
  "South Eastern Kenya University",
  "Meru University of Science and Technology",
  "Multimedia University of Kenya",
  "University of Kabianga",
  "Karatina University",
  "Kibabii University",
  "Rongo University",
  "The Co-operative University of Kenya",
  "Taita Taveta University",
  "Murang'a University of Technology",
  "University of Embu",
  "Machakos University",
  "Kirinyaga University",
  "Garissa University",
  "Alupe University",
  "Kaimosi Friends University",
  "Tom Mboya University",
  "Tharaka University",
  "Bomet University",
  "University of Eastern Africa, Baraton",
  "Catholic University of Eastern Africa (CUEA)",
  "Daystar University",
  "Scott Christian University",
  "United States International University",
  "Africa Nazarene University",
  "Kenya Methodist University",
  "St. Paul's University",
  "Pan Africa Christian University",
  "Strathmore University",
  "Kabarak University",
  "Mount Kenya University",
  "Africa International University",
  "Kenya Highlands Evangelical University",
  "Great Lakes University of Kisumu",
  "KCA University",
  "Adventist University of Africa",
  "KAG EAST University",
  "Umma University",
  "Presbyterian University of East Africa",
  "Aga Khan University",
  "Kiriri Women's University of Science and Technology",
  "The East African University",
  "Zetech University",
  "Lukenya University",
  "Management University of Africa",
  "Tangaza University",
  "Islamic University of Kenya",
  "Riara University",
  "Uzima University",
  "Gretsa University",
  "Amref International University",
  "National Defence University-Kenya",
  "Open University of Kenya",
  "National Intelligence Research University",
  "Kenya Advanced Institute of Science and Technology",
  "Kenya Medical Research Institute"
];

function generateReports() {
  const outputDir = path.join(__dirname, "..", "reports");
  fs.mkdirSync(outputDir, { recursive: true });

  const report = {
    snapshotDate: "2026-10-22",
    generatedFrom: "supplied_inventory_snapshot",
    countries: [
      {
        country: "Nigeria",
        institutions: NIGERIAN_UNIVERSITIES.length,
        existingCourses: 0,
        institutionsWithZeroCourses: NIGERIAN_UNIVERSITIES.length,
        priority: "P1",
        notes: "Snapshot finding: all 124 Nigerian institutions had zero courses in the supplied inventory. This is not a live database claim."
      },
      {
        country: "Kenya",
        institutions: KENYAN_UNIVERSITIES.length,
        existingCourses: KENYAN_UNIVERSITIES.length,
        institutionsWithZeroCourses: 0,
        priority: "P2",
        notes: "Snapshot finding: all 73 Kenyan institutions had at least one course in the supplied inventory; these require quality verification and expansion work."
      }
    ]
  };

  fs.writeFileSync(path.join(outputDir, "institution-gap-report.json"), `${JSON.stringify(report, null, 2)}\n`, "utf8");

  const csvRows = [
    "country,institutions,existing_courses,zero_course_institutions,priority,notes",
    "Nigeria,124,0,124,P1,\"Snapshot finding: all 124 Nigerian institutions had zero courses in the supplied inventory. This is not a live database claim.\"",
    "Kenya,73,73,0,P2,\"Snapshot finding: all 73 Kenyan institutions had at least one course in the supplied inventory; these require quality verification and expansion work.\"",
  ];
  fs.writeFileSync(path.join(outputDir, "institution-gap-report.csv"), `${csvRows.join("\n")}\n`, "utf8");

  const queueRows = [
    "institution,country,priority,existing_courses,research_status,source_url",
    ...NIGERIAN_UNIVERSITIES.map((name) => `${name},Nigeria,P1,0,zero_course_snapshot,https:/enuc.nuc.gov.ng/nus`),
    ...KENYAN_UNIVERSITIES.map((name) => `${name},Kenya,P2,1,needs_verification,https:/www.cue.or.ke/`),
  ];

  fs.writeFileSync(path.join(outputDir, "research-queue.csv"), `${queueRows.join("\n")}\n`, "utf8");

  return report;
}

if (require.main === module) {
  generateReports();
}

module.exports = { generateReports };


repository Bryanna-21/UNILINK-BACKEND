const fs = require("fs");
const path = require("path");

const NIGERIAN_UNIVERSITIES = [
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

const KENYAN_UNIVERSITIES = [
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
  "National Defence University-Kenya",
  "Open University of Kenya",
  "National Intelligence Research University",
  "Kenya Advanced Institute of Science and Technology",
  "Kenya Medical Research Institute"
];

function buildInventorySnapshot() {
  return {
    snapshotDate: "2026-10-22",
    countries: [
      {
        country: "Nigeria",
        institutions: NIGERIAN_UNIVERSITIES.map((name) => ({
          name,
          existingCourses: 0,
          priority: "P1",
          researchStatus: "zero_course_snapshot",
          sourceUrl: "https://enuc.nuc.gov.ng/nus",
        })),
        regulatorUrl: "https://enuc.nuc.gov.ng/nus",
        priority: "P1",
        notes: "Snapshot finding: all 124 Nigerian institutions had zero courses in the supplied inventory."
      },
      {
        country: "Kenya",
        institutions: KENYAN_UNIVERSITIES.map((name) => ({
          name,
          existingCourses: 1,
          priority: "P2",
          researchStatus: "needs_verification",
          sourceUrl: "https://www.cue.or.ke/",
        })),
        regulatorUrl: "https://www.cue.or.ke/",
        priority: "P2",
        notes: "Snapshot finding: all 73 Kenyan institutions had at least one course in the supplied inventory and need coverage quality checks."
      }
    ]
  };
}

function generateReports(outputDir) {
  const snapshot = buildInventorySnapshot();
  const report = {
    snapshotDate: snapshot.snapshotDate,
    generatedFrom: "supplied_inventory_snapshot",
    countries: snapshot.countries.map((entry) => ({
      country: entry.country,
      institutions: entry.institutions.length,
      existingCourses: entry.institutions.reduce((total, institution) => total + Number(institution.existingCourses || 0), 0),
      institutionsWithZeroCourses: entry.country === "Nigeria" ? entry.institutions.length : 0,
      priority: entry.priority,
      notes: entry.notes,
    })),
  };

  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "institution-gap-report.json"), `${JSON.stringify(report, null, 2)}\n`, "utf8");

  const csvRows = [
    "country,institutions,existing_courses,zero_course_institutions,priority,notes",
    ...report.countries.map((country) => `${country.country},${country.institutions},${country.existingCourses},${country.institutionsWithZeroCourses},${country.priority},"${country.notes.replace(/"/g, '""')}"`),
  ];
  fs.writeFileSync(path.join(outputDir, "institution-gap-report.csv"), `${csvRows.join("\n")}\n`, "utf8");

  const queueRows = [
    "institution,country,priority,existing_courses,research_status,source_url",
    ...snapshot.countries.flatMap((entry) =>
      entry.institutions.map((institution) => {
        const priority = entry.country === "Nigeria" ? "P1" : "P2";
        const researchStatus = entry.country === "Nigeria" ? "zero_course_snapshot" : "needs_verification";
        return `${institution.name},${entry.country},${priority},${institution.existingCourses},${researchStatus},${institution.sourceUrl}`;
      })
    ),
  ];
  fs.writeFileSync(path.join(outputDir, "research-queue.csv"), `${queueRows.join("\n")}\n`, "utf8");

  return { report, snapshot };
}

if (require.main === module) {
  const outputDir = path.join(__dirname, "..", "reports");
  generateReports(outputDir);
}

module.exports = {
  NIGERIAN_UNIVERSITIES,
  KENYAN_UNIVERSITIES,
  buildInventorySnapshot,
  generateReports,
};









































































