"use strict";

// Starter programmes. A template becomes a Course at every institution it applies to (by institution type or by
// exact institution name). Codes for degree programmes are the ones scripts/seedKenyanCourses.js already uses, so
// existing courses are matched (by code, then by title) and only ever get missing metadata filled in.
//
// EVERYTHING HERE IS "needs_verification": these are typical offerings by institution type, not a confirmed
// course list for each individual institution. durationYears and semestersPerYear are typical values.
// `curriculum` names an entry in curricula.js (illustrative unit structure, also unverified).

const MED = ["medical_training"];
const UNI = ["university_public", "university_private"];
const TECH = ["national_polytechnic", "tvet_college"];
const TEACH = ["teacher_training"];

const t = (code, title, level, durationYears, appliesTo, extra = {}) => ({
  code, title, level, durationYears, semestersPerYear: extra.semestersPerYear || 2,
  appliesTo, curriculum: extra.curriculum || null,
});

module.exports = [
  // ── Medical training: diplomas, higher diplomas, certificates ───────────────
  t("DIP-NURS", "Diploma in Nursing (KRCHN)", "diploma", 3, { types: [...MED, "university_private"] }, { curriculum: "dip-nursing" }),
  t("DIP-CM", "Diploma in Clinical Medicine and Surgery", "diploma", 3, { types: [...MED, "university_private"] }, { curriculum: "dip-clinical-medicine" }),
  t("DIP-MLS", "Diploma in Medical Laboratory Sciences", "diploma", 3, { types: MED }),
  t("DIP-PHARM", "Diploma in Pharmaceutical Technology", "diploma", 3, { types: MED }),
  t("DIP-PH", "Diploma in Public Health", "diploma", 3, { types: MED }),
  t("DIP-NUTR", "Diploma in Nutrition and Dietetics", "diploma", 3, { types: MED }),
  t("DIP-MI", "Diploma in Medical Imaging Sciences", "diploma", 3, { types: MED }),
  t("DIP-PHYSIO", "Diploma in Physiotherapy", "diploma", 3, { types: MED }),
  t("CERT-CHA", "Certificate in Community Health", "certificate", 2, { types: MED }),
  t("HD-CCN", "Higher Diploma in Critical Care Nursing", "higher_diploma", 2, { types: MED }),
  t("HD-PERI", "Higher Diploma in Perioperative Nursing", "higher_diploma", 2, { types: MED }),

  // ── Universities: degrees not already in the starter seed, plus common diplomas ──
  t("BSc-NURS", "Bachelor of Science in Nursing", "degree", 4, { types: UNI }),
  t("BSc-IT", "Bachelor of Science in Information Technology", "degree", 4, { types: UNI }, { curriculum: "bsc-it" }),
  t("DIP-ICT", "Diploma in Information Communication Technology", "diploma", 2, { types: [...UNI, ...TECH, "other_tertiary"], names: ["Institute of Advanced Technology"] }, { curriculum: "dip-ict", semestersPerYear: 3 }),
  t("DIP-BM", "Diploma in Business Management", "diploma", 2, { types: [...UNI, ...TECH], names: ["Kenya Institute of Management"] }, { curriculum: "dip-business", semestersPerYear: 3 }),
  t("DIP-ACC", "Diploma in Accountancy", "diploma", 2, { types: [...UNI, ...TECH] }),

  // ── National polytechnics and TVET colleges ────────────────────────────────
  t("DIP-HRM", "Diploma in Human Resource Management", "diploma", 2, { types: TECH }),
  t("DIP-SCM", "Diploma in Supply Chain Management", "diploma", 2, { types: TECH }),
  t("DIP-EEE", "Diploma in Electrical and Electronic Engineering", "diploma", 3, { types: TECH }),
  t("DIP-CIV", "Diploma in Civil Engineering", "diploma", 3, { types: TECH, names: ["Kenya Institute of Highways and Building Technology"] }),
  t("DIP-MECH", "Diploma in Mechanical Engineering", "diploma", 3, { types: TECH }),
  t("DIP-AUTO", "Diploma in Automotive Engineering", "diploma", 3, { types: TECH }),
  t("DIP-BLD", "Diploma in Building Technology", "diploma", 3, { types: TECH, names: ["Kenya Institute of Highways and Building Technology"] }),
  t("DIP-AGR", "Diploma in Agriculture", "diploma", 2, { types: TECH }),
  t("DIP-HM", "Diploma in Hospitality Management", "diploma", 2, { types: TECH, names: ["Kenya Utalii College"] }),
  t("CERT-ICT", "Certificate in Information Communication Technology", "certificate", 1, { types: TECH }),
  t("CERT-BM", "Certificate in Business Management", "certificate", 1, { types: TECH }),
  t("CERT-EEE", "Certificate in Electrical and Electronic Engineering", "certificate", 2, { types: TECH }),
  t("CERT-AUTO", "Certificate in Automotive Engineering", "certificate", 2, { types: TECH }),
  t("CERT-BLD", "Certificate in Building and Civil Engineering", "certificate", 2, { types: TECH }),
  t("CERT-HM", "Certificate in Hospitality and Catering", "certificate", 1, { types: TECH }),
  t("HD-ICT", "Higher Diploma in Information Technology", "higher_diploma", 2, { types: ["national_polytechnic"] }),
  t("HD-BM", "Higher Diploma in Business Management", "higher_diploma", 2, { types: ["national_polytechnic"] }),

  // ── Teacher training ───────────────────────────────────────────────────────
  t("DIP-PTE", "Diploma in Primary Teacher Education", "diploma", 3, { types: TEACH }),
  t("DIP-ECDE", "Diploma in Early Childhood Development Education", "diploma", 2, { types: TEACH }),
  t("DIP-SNE", "Diploma in Special Needs Education", "diploma", 2, { types: TEACH, names: ["Kenya Institute of Special Education"] }),
  t("CERT-ECDE", "Certificate in Early Childhood Development Education", "certificate", 1, { types: TEACH }),

  // ── Specific institutions ──────────────────────────────────────────────────
  t("DIP-MASSCOM", "Diploma in Mass Communication", "diploma", 2, { names: ["Kenya Institute of Mass Communication"] }),
  t("DIP-JOUR", "Diploma in Journalism", "diploma", 2, { names: ["Kenya Institute of Mass Communication"] }),
  t("DIP-FOR", "Diploma in Forestry", "diploma", 2, { names: ["Kenya Forestry College"] }),
  t("DIP-WATER", "Diploma in Water Engineering", "diploma", 3, { names: ["Kenya Water Institute"] }),
  t("DIP-SURV", "Diploma in Land Surveying", "diploma", 3, { names: ["Kenya Institute of Surveying and Mapping"] }),
  t("DIP-TOUR", "Diploma in Tourism Management", "diploma", 2, { names: ["Kenya Utalii College"] }),
];
