"use strict";

// Pure rules for academic profile fields, unit enrolment and who may see a course.
// No database and no mongoose in here: everything is unit-tested.

const MAX_ENROLLED_UNITS = 15;
const LIMITS = { name: 100, bio: 500, phone: 30, programme: 80, query: 50 };

const isObjectId = (v) => /^[a-f0-9]{24}$/i.test(String(v ?? ""));

// Strips control characters; collapses whitespace. Multiline keeps single line breaks (bio).
const cleanLine = (v) =>
  String(v).replace(/[\u0000-\u001F\u007F]/g, " ").replace(/\s+/g, " ").trim();
const cleanMultiline = (v) =>
  String(v)
    .replace(/\r\n?/g, "\n")
    .replace(/[\u0000-\u0009\u000B-\u001F\u007F]/g, " ")
    .replace(/[ \t]+/g, " ")
    .replace(/ ?\n ?/g, "\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();

const bad = (message) => ({ ok: false, message });

// Accepts 3, "3" and rejects 3.5, "3.5", "abc", true, {} and out-of-range values.
// null and "" mean "clear it".
function parseBoundedInt(value, min, max, label) {
  if (value === null || value === "") return { ok: true, value: null };
  if (typeof value !== "number" && typeof value !== "string") return bad(`${label} must be a number.`);
  if (typeof value === "string" && !/^\d{1,2}$/.test(value.trim())) return bad(`${label} must be a whole number.`);
  const n = typeof value === "number" ? value : Number(value.trim());
  if (!Number.isInteger(n)) return bad(`${label} must be a whole number.`);
  if (n < min || n > max) return bad(`${label} must be between ${min} and ${max}.`);
  return { ok: true, value: n };
}

// Returns { ok: true, update } holding ONLY the fields that were provided, cleaned,
// or { ok: false, message }. The server is the authority: the client's checks are a courtesy.
function validateProfileFields({ name, bio, phone, programme, yearOfStudy, semester } = {}) {
  const update = {};

  if (name !== undefined) {
    if (typeof name !== "string") return bad("Name must be text.");
    const v = cleanLine(name);
    if (!v) return bad("Name can't be empty.");
    if (v.length > LIMITS.name) return bad(`Name is too long (max ${LIMITS.name} characters).`);
    update.name = v;
  }

  if (bio !== undefined) {
    if (bio !== null && typeof bio !== "string") return bad("Bio must be text.");
    const v = bio === null ? "" : cleanMultiline(bio);
    if (v.length > LIMITS.bio) return bad(`Bio is too long (max ${LIMITS.bio} characters).`);
    update.bio = v;
  }

  if (phone !== undefined) {
    if (phone !== null && typeof phone !== "string") return bad("Phone must be text.");
    const v = phone === null ? "" : phone.trim();
    if (v.length > LIMITS.phone) return bad(`Phone number is too long (max ${LIMITS.phone} characters).`);
    if (v && !/^[0-9+()\-\s.]+$/.test(v)) return bad("Phone numbers can only contain digits, spaces and + - ( ) .");
    update.phone = v;
  }

  if (programme !== undefined) {
    if (programme !== null && typeof programme !== "string") return bad("Programme must be text.");
    const v = programme === null ? "" : cleanLine(programme);
    if (v.length > LIMITS.programme) return bad(`Programme is too long (max ${LIMITS.programme} characters).`);
    update.programme = v;
  }

  if (yearOfStudy !== undefined) {
    const r = parseBoundedInt(yearOfStudy, 1, 6, "Year of study");
    if (!r.ok) return r;
    update.yearOfStudy = r.value;
  }

  if (semester !== undefined) {
    const r = parseBoundedInt(semester, 1, 3, "Semester");
    if (!r.ok) return r;
    update.semester = r.value;
  }

  return { ok: true, update };
}

const cleanQuery = (raw) => cleanLine(raw ?? "").slice(0, LIMITS.query);

const sameUniversity = (a, b) => !!a && !!b && String(a) === String(b);

// Enrolment decision. `alreadyEnrolled` is idempotent success and is checked BEFORE the cap,
// so a repeated tap never fails. Cross-university and legacy courses with no university
// answer as "not found" so the endpoint can't be used to probe other universities.
function canEnroll({ viewer, course, enrolledCount, alreadyEnrolled, max = MAX_ENROLLED_UNITS }) {
  if (!viewer || viewer.deletedAt) return { ok: false, status: 401, message: "Account not available." };
  if (viewer.role !== "student") return { ok: false, status: 403, message: "Only students can enrol in units." };
  if (!course) return { ok: false, status: 404, message: "Course not found" };
  if (!sameUniversity(viewer.universityId, course.universityId)) {
    return { ok: false, status: 404, message: "Course not found" };
  }
  if (alreadyEnrolled) return { ok: true, already: true };
  if (enrolledCount >= max) {
    return { ok: false, status: 409, message: `You can enrol in at most ${max} units. Drop one first.` };
  }
  return { ok: true, already: false };
}

const isEnrolledIn = (course, userId) =>
  (course.enrolledStudentIds || []).map(String).includes(String(userId));

// Who may open a course by id. Admins and superadmins are unchanged from before (other consumers
// may rely on that); students and lecturers are limited to their own university or membership.
function canViewCourse({ viewer, course }) {
  if (!viewer || !course) return false;
  if (viewer.role === "admin" || viewer.role === "superadmin") return true;
  if (viewer.role === "lecturer") {
    return String(course.lecturerId) === String(viewer._id) || sameUniversity(viewer.universityId, course.universityId);
  }
  return isEnrolledIn(course, viewer._id) || sameUniversity(viewer.universityId, course.universityId);
}

// Plain object copy with enrolment ids limited to what this viewer may see:
// students see only themselves, a lecturer sees the full list only for their own course,
// admins see everything. `enrolledCount` is always present so UIs can still show a number.
function shapeCourse({ course, viewer, exposeIds = false }) {
  const plain = typeof course.toObject === "function" ? course.toObject() : { ...course };
  const ids = (plain.enrolledStudentIds || []).map(String);
  plain.enrolledCount = ids.length;
  if (exposeIds) return plain;
  const me = String(viewer._id);
  if (viewer.role === "student") {
    plain.enrolledStudentIds = ids.includes(me) ? [me] : [];
  } else if (viewer.role === "lecturer" && String(plain.lecturerId) !== me) {
    plain.enrolledStudentIds = [];
  }
  return plain;
}

module.exports = {
  MAX_ENROLLED_UNITS, LIMITS, isObjectId, cleanLine, cleanQuery, parseBoundedInt,
  validateProfileFields, canEnroll, canViewCourse, shapeCourse, isEnrolledIn, sameUniversity,
};
