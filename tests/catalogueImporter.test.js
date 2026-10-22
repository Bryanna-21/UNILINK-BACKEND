"use strict";

const fs = require("fs");
const path = require("path");

function generateGapReport() {
  const payload = {
    snapshotDate: "2026-10-22",
    generatedFrom: "supplied_inventory_snapshot",
    countries: [
      {
        country: "Nigeria",
        institutions: 124,
        existingCourses: 0,
        institutionsWithZeroCourses: 124,
        priority: "P1",
        notes: "All 124 Nigerian institutions had zero courses in the supplied snapshot; not a live DB claim.",
      },
      {
        country: "Kenya",
        institutions: 73,
        existingCourses: 73,
        institutionsWithZeroCourses: 0,
        priority: "P2",
        notes: "All 73 Kenyan institutions had at least one course in the supplied snapshot; focus is on verification, expansion, and quality."
      },
    ],
  };

  const outputDir = path.join(__dirname, "..", "reports");
  fs.mkdirSync(outputDir, { recursive: true });
  fs.writeFileSync(path.join(outputDir, "institution-gap-report.json"), `${JSON.stringify(payload, null, 2)}\n`, "utf8");

  const csv = [
    "country,institutions,existing_courses,zero_course_institutions,priority,notes",
    "Nigeria,124,0,124,P1,All 124 Nigerian institutions had zero courses in the supplied snapshot.",
    "Kenya,73,73,0,P2,All 73 Kenyan institutions had at least one course in the supplied snapshot.",
  ].join("\n");

  fs.writeFileSync(path.join(outputDir, "institution-gap-report.csv"), `${csv}\n`, "utf8");

  const queue = [
    "institution,country,priority,reason,source_url",
    "University of Lagos,Nigeria,P1,zero-course institution in supplied snapshot,https://www.admissions.unilag.edu.ng/programmes.html",
    "University of Ibadan,Nigeria,P1,zero-course institution in supplied snapshot,https://ui.edu.ng/",
    "Ahmadu Bello University,Nigeria,P1,zero-course institution in supplied snapshot,https://abu.edu.ng/",
    "University of Nairobi,Kenya,P2,needs coverage verification and evidence quality review,https://www.uonbi.ac.ke/",
    "Kenyatta University,Kenya,P2,needs coverage verification and evidence quality review,https://www.ku.ac.ke/",
    "Moi University,Kenya,P2,needs coverage verification and evidence quality review,https://www.mu.ac.ke/",
  ].join("\n");

  fs.writeFileSync(path.join(outputDir, "research-queue.csv"), `${queue}\n`, "utf8");

  return payload;
}

if (require.main === module) {
  generateGapReport();
}

module.exports = { generateGapReport };
