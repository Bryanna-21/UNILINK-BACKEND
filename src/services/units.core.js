"use strict";

// Course visibility, the "available units" browser, and enrol / unenrol.
// No mongoose here: database access goes through `repo` (units.repo.js), so every decision
// in this file runs under `npm test` against an in-memory repo.

const rules = require("../utils/units.rules");

const ok = (extra = {}) => ({ ok: true, ...extra });
const fail = (status, message) => ({ ok: false, status, message });

function createUnitsCore({ repo, config = {} }) {
  const cfg = {
    enforceAccess: true, // COURSES_ENFORCE_ACCESS=false restores the old open getCourseById
    exposeEnrolmentIds: false, // COURSES_EXPOSE_ENROLMENT_IDS=true restores full id lists for students
    unitEnrolmentEnabled: true, // FEATURE_UNIT_ENROLMENT=false switches enrol/unenrol off
    maxUnits: rules.MAX_ENROLLED_UNITS,
    availableLimit: 40,
    ...config,
  };

  async function viewerOrNull(viewerId) {
    const me = await repo.userById(viewerId);
    return me && !me.deletedAt ? me : null;
  }

  const shape = (course, me) => rules.shapeCourse({ course, viewer: me, exposeIds: cfg.exposeEnrolmentIds });

  // Same role scoping as the old GET /courses: students their enrolled courses, lecturers theirs,
  // admins everything. Only the enrolment ids in the response are trimmed.
  async function listCourses(viewerId) {
    const me = await viewerOrNull(viewerId);
    if (!me) return fail(401, "Account not available.");
    const courses = await repo.listCoursesFor({ role: me.role, userId: String(me._id) });
    return ok({ count: courses.length, data: courses.map((c) => shape(c, me)) });
  }

  async function getCourse(viewerId, courseId) {
    if (!rules.isObjectId(courseId)) return fail(400, "Invalid course id");
    const me = await viewerOrNull(viewerId);
    if (!me) return fail(401, "Account not available.");
    const course = await repo.courseById(courseId);
    if (!course) return fail(404, "Course not found");
    if (cfg.enforceAccess && !rules.canViewCourse({ viewer: me, course })) return fail(404, "Course not found");
    return ok({ data: shape(course, me) });
  }

  // Courses at the student's own university, optionally filtered by title or code.
  // Never returns enrolment id lists, only a count and whether the caller is enrolled.
  async function available(viewerId, rawQuery) {
    const me = await viewerOrNull(viewerId);
    if (!me) return fail(401, "Account not available.");
    if (me.role !== "student") return fail(403, "Only students can browse units to enrol in.");
    if (!me.universityId) return ok({ count: 0, data: [] });

    const courses = await repo.searchCourses({
      universityId: String(me.universityId),
      q: rules.cleanQuery(rawQuery),
      limit: cfg.availableLimit,
    });

    const lecturerIds = [...new Set(courses.map((c) => c.lecturerId).filter((id) => rules.isObjectId(id)).map(String))];
    const lecturers = lecturerIds.length ? await repo.usersByIds(lecturerIds) : [];
    const nameOf = new Map(lecturers.map((u) => [String(u._id), u.name]));

    const data = courses.map((c) => ({
      _id: String(c._id),
      title: c.title,
      code: c.code || null,
      description: c.description ? String(c.description).slice(0, 200) : "",
      lecturerName: nameOf.get(String(c.lecturerId)) || null,
      enrolledCount: (c.enrolledStudentIds || []).length,
      isEnrolled: rules.isEnrolledIn(c, me._id),
    }));
    return ok({ count: data.length, data });
  }

  async function enroll(viewerId, courseId) {
    if (!cfg.unitEnrolmentEnabled) return fail(403, "Unit enrolment is switched off right now.");
    if (!rules.isObjectId(courseId)) return fail(400, "Invalid course id");
    const me = await viewerOrNull(viewerId);
    const course = me ? await repo.courseById(courseId) : null;
    const already = !!course && rules.isEnrolledIn(course, viewerId);
    const enrolledCount = me && me.role === "student" && !already ? await repo.countEnrolled(String(me._id)) : 0;

    const decision = rules.canEnroll({
      viewer: me, course, enrolledCount, alreadyEnrolled: already, max: cfg.maxUnits,
    });
    if (!decision.ok) return fail(decision.status, decision.message);

    if (!decision.already) await repo.addEnrollment(courseId, String(me._id)); // atomic $addToSet
    const fresh = (await repo.courseById(courseId)) || course;
    return ok({ data: shape(fresh, me), enrolled: true, alreadyEnrolled: decision.already });
  }

  // Dropping a unit removes the student from the roster only. Attendance, submissions and
  // results are kept, so a re-enrol restores a complete history.
  async function unenroll(viewerId, courseId) {
    if (!cfg.unitEnrolmentEnabled) return fail(403, "Unit enrolment is switched off right now.");
    if (!rules.isObjectId(courseId)) return fail(400, "Invalid course id");
    const me = await viewerOrNull(viewerId);
    if (!me) return fail(401, "Account not available.");
    if (me.role !== "student") return fail(403, "Only students can drop units.");
    const course = await repo.courseById(courseId);
    if (!course) return fail(404, "Course not found");
    const removed = await repo.removeEnrollment(courseId, String(me._id)); // atomic $pull
    return ok({ data: { enrolled: false, wasEnrolled: removed } });
  }

  return { listCourses, getCourse, available, enroll, unenroll };
}

module.exports = { createUnitsCore };
