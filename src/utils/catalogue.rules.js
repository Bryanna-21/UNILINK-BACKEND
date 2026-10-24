"use strict";

// Pure rules for the institution / course / unit catalogue. No database in here.
//
// Vocabulary
//   institution  a row in the University collection (the name is historical). institutionType says what kind.
//   course       a programme a student enrols in, e.g. "Diploma in Nursing (KRCHN)". Lives in the Course collection.
//   unit         one subject inside a course (CourseUnit collection), placed in a year of study and a semester.
//
// Anything the platform seeds is "needs_verification" until a superadmin confirms it.

const INSTITUTION_TYPES = [
  "university_public",
  "university_private",
  "national_polytechnic",
  "tvet_college",
  "teacher_training",
  "medical_training",
  "other_tertiary",
];

// Values an earlier session wrote into the database (and its schema) before this catalogue existed. They are still
// accepted on read and mapped onto the canonical types, so records created either way keep working.
const LEGACY_INSTITUTION_TYPES = {
  teacher_training_college: "teacher_training",
  medical_training_college: "medical_training",
  technical_institute: "tvet_college",
};

const LEVELS = ["certificate", "diploma", "higher_diploma", "degree", "postgraduate"];
const VERIFICATION = ["verified", "needs_verification"];

const LIMITS = { code: 40, title: 160, description: 600, unitName: 160, maxYear: 8, maxSemester: 3 };

const INSTITUTION_TYPE_LABELS = {
  university_public: "Public university",
  university_private: "Private university",
  national_polytechnic: "National polytechnic",
  tvet_college: "TVET college / technical institute",
  teacher_training: "Teacher training college",
  medical_training: "Medical training college",
  other_tertiary: "Other tertiary institution",
};

const LEVEL_LABELS = {
  certificate: "Certificate",
  diploma: "Diploma",
  higher_diploma: "Higher diploma",
  degree: "Degree",
  postgraduate: "Postgraduate",
};

const isObjectId = (v) => /^[a-f0-9]{24}$/i.test(String(v ?? ""));

// Lower-case, accent-free, "&" read as "and", everything else collapsed to single spaces.
function normalizeText(raw) {
  return String(raw == null ? "" : raw)
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .toLowerCase()
    .replace(/&/g, " and ")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

// Two titles that differ only in case, punctuation or a leading "the" are the same title.
const titleKey = (raw) => normalizeText(raw).replace(/^the /, "");

const normalizeCode = (raw) => String(raw == null ? "" : raw).trim().replace(/\s+/g, " ").toUpperCase();

const cleanLine = (raw) => String(raw == null ? "" : raw).replace(/[\u0000-\u001f\u007f]/g, " ").replace(/\s+/g, " ").trim();

const parseLevel = (raw) => {
  const v = normalizeText(raw).replace(/ /g, "_");
  return LEVELS.includes(v) ? v : null;
};
const parseInstitutionType = (raw) => {
  const v = normalizeText(raw).replace(/ /g, "_");
  if (INSTITUTION_TYPES.includes(v)) return v;
  return LEGACY_INSTITUTION_TYPES[v] || null;
};

// Every value the database may hold for one canonical type (the type itself plus its legacy spellings).
const storedTypesFor = (canonical) => [canonical, ...Object.keys(LEGACY_INSTITUTION_TYPES).filter((k) => LEGACY_INSTITUTION_TYPES[k] === canonical)];

// Anything not explicitly "verified" counts as needing verification, whichever spelling an older record uses.
const normalizeVerification = (raw) => (raw === "verified" ? "verified" : "needs_verification");

const fail = (message) => ({ ok: false, message });

function parseIntIn(raw, min, max) {
  if (raw === null || raw === undefined || raw === "") return { ok: true, value: null };
  const n = typeof raw === "number" ? raw : Number(String(raw).trim());
  if (!Number.isInteger(n) || n < min || n > max) return { ok: false };
  return { ok: true, value: n };
}

function validateCourseInput(input) {
  if (!input || typeof input !== "object") return fail("Course must be an object.");
  const code = normalizeCode(cleanLine(input.code));
  const title = cleanLine(input.title);
  if (!code || code.length > LIMITS.code) return fail("Course code is required (max 40 characters).");
  if (!title || title.length > LIMITS.title) return fail("Course title is required (max 160 characters).");
  const level = parseLevel(input.level);
  if (!level) return fail(`Course level must be one of: ${LEVELS.join(", ")}.`);
  const dur = parseIntIn(input.durationYears, 1, LIMITS.maxYear);
  if (!dur.ok) return fail("durationYears must be a whole number from 1 to 8.");
  const spy = parseIntIn(input.semestersPerYear, 1, LIMITS.maxSemester);
  if (!spy.ok) return fail("semestersPerYear must be 1, 2 or 3.");
  const description = cleanLine(input.description).slice(0, LIMITS.description);
  return { ok: true, value: { code, title, level, durationYears: dur.value, semestersPerYear: spy.value ?? 2, description } };
}

function validateUnitInput(input, { durationYears = LIMITS.maxYear, semestersPerYear = LIMITS.maxSemester } = {}) {
  if (!input || typeof input !== "object") return fail("Unit must be an object.");
  const code = normalizeCode(cleanLine(input.code));
  const name = cleanLine(input.name);
  if (!code || code.length > LIMITS.code) return fail("Unit code is required (max 40 characters).");
  if (!name || name.length > LIMITS.unitName) return fail(`Unit ${code || "?"}: name is required (max 160 characters).`);
  const year = parseIntIn(input.yearOfStudy ?? input.year, 1, durationYears);
  if (!year.ok || year.value === null) return fail(`Unit ${code}: year of study must be a whole number from 1 to ${durationYears}.`);
  const sem = parseIntIn(input.semester, 1, semestersPerYear);
  if (!sem.ok || sem.value === null) return fail(`Unit ${code}: semester must be a whole number from 1 to ${semestersPerYear}.`);
  let credits = null;
  if (input.credits !== null && input.credits !== undefined && input.credits !== "") {
    const c = Number(input.credits);
    if (!Number.isFinite(c) || c < 0 || c > 30) return fail(`Unit ${code}: credits must be between 0 and 30.`);
    credits = c;
  }
  return {
    ok: true,
    value: { code, name, description: cleanLine(input.description).slice(0, LIMITS.description), credits, yearOfStudy: year.value, semester: sem.value },
  };
}

// Admins and superadmins see every course; everyone else only their own institution's.
function canSeeCatalogueCourse({ viewer, course }) {
  if (!viewer || !course) return false;
  if (viewer.role === "admin" || viewer.role === "superadmin") return true;
  return !!viewer.universityId && String(viewer.universityId) === String(course.universityId);
}

// Which institutions a starter course template applies to: by institution type or by exact name.
function templateApplies(template, institution) {
  const a = template.appliesTo || {};
  if ((a.types || []).includes(institution.institutionType)) return true;
  const key = titleKey(institution.name);
  return (a.names || []).some((n) => titleKey(n) === key);
}

module.exports = {
  INSTITUTION_TYPES, LEGACY_INSTITUTION_TYPES, LEVELS, VERIFICATION, LIMITS, storedTypesFor, normalizeVerification, INSTITUTION_TYPE_LABELS, LEVEL_LABELS,
  isObjectId, normalizeText, titleKey, normalizeCode, cleanLine, parseLevel, parseInstitutionType,
  validateCourseInput, validateUnitInput, canSeeCatalogueCourse, templateApplies,
};
