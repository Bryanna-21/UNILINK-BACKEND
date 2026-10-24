"use strict";

// ILLUSTRATIVE unit structures. These show how a course's units are laid out by year of study and semester. They
// are typical subjects for the kind of programme, NOT any institution's official curriculum, and every unit is
// seeded as "needs_verification". Unit codes here are neutral placeholders (prefix + year + semester + number), not
// real institutional codes. The client replaces them through the admin import once the real curriculum is confirmed.
// Nothing here is shown to students as verified.

// build("ITC", { "1.1": ["Unit A", "Unit B"], "1.2": [...] }) -> units with codes ITC111, ITC112, ITC121 ...
function build(prefix, plan, credits = 3) {
  const units = [];
  for (const [slot, names] of Object.entries(plan)) {
    const [year, semester] = slot.split(".").map(Number);
    names.forEach((name, i) => {
      units.push({ code: `${prefix}${year}${semester}${i + 1}`, name, credits, yearOfStudy: year, semester });
    });
  }
  return units;
}

module.exports = {
  "bsc-it": build("ITC", {
    "1.1": ["Programming Fundamentals", "Computer Systems", "Mathematics for Computing", "Communication Skills"],
    "1.2": ["Data Structures", "Database Systems", "Object-Oriented Programming", "Discrete Mathematics"],
    "2.1": ["Web Development", "Operating Systems", "Computer Networks", "Statistics for Computing"],
    "2.2": ["Systems Analysis and Design", "Software Engineering", "Human-Computer Interaction", "Network Administration"],
    "3.1": ["Mobile Application Development", "Information Security", "Database Administration", "Research Methods"],
    "3.2": ["Cloud Computing", "Project Management", "Data Analytics", "Professional Ethics in ICT"],
    "4.1": ["Final Year Project I", "Emerging Technologies", "IT Entrepreneurship", "Enterprise Systems"],
    "4.2": ["Final Year Project II", "Artificial Intelligence Fundamentals", "IT Governance and Audit", "Industrial Attachment Report"],
  }),

  "dip-ict": build("DICT", {
    "1.1": ["Computer Applications", "Communication Skills", "Introduction to Programming", "Mathematics for ICT"],
    "1.2": ["Computer Hardware and Maintenance", "Web Design", "Database Concepts", "Entrepreneurship Skills"],
    "1.3": ["Programming in Java", "Operating Systems", "Computer Networks I", "Industrial Attachment"],
    "2.1": ["Systems Analysis and Design", "Database Management Systems", "Computer Networks II", "Web Programming"],
    "2.2": ["Information Systems Security", "Software Engineering", "Mobile Application Basics", "Project Management"],
    "2.3": ["ICT Project", "E-Commerce", "Network Administration", "Professional Practice in ICT"],
  }),

  "dip-business": build("DBM", {
    "1.1": ["Principles of Management", "Business Mathematics", "Communication Skills", "Introduction to Accounting"],
    "1.2": ["Microeconomics", "Business Law", "Computer Applications", "Entrepreneurship"],
    "1.3": ["Marketing Principles", "Organisational Behaviour", "Business Statistics", "Industrial Attachment"],
    "2.1": ["Human Resource Management", "Financial Accounting", "Macroeconomics", "Operations Management"],
    "2.2": ["Business Research Methods", "Financial Management", "Strategic Management", "Business Ethics"],
    "2.3": ["Project Management", "Entrepreneurship Project", "Public Relations", "Business Plan Development"],
  }),

  "dip-nursing": build("NRS", {
    "1.1": ["Anatomy and Physiology I", "Fundamentals of Nursing", "Communication and Counselling", "Microbiology and Parasitology"],
    "1.2": ["Anatomy and Physiology II", "Basic Pharmacology", "Nutrition and Diet Therapy", "Primary Health Care"],
    "2.1": ["Medical-Surgical Nursing I", "Maternal and Child Health Nursing", "Community Health Nursing", "Pharmacology and Therapeutics"],
    "2.2": ["Medical-Surgical Nursing II", "Paediatric Nursing", "Mental Health and Psychiatric Nursing", "Clinical Practicum I"],
    "3.1": ["Advanced Medical-Surgical Nursing", "Reproductive Health and Midwifery", "Health Education and Promotion", "Research Methods in Nursing"],
    "3.2": ["Nursing Leadership and Management", "Professional Ethics and Law in Nursing", "Emergency and Critical Care Nursing", "Clinical Practicum II"],
  }, 4),

  "dip-clinical-medicine": build("CMS", {
    "1.1": ["Human Anatomy", "Human Physiology", "Medical Microbiology", "Communication Skills"],
    "1.2": ["Pathology", "Pharmacology I", "Biochemistry", "Community Health"],
    "2.1": ["Clinical Medicine I", "Clinical Surgery I", "Pharmacology II", "Medical Laboratory Techniques"],
    "2.2": ["Clinical Medicine II", "Paediatrics and Child Health", "Obstetrics and Gynaecology", "Clinical Rotation I"],
    "3.1": ["Clinical Medicine III", "Clinical Surgery II", "Mental Health", "Emergency Medicine"],
    "3.2": ["Health Systems Management", "Medical Ethics and Law", "Research Methods", "Clinical Rotation II"],
  }, 4),
};
