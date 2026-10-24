"use strict";

// Who may pick which course for their profile. Pure: the controller loads the course and passes it in.
//
//   - Only students pick a course.
//   - null clears the selection.
//   - The course must exist AND belong to the student's institution (the one they will have after this
//     request, if they are switching institution in the same save). A course at another institution
//     answers "not found", so the endpoint cannot be used to probe other institutions' catalogues.

const { isObjectId } = require("./catalogue.rules");

const refuse = (status, message) => ({ ok: false, status, message });

// user: { role }, courseId: what the client sent, course: the loaded Course (or null),
// universityId: the institution the student will be at once this request is saved.
function decideCourseSelection({ user, courseId, course, universityId }) {
  if (!user || user.role !== "student") return refuse(403, "Only students choose a course.");
  if (courseId === null || courseId === "") return { ok: true, courseId: null };
  if (typeof courseId !== "string") return refuse(400, "Course ID must be text.");
  const id = courseId.trim();
  if (!isObjectId(id)) return refuse(400, "Course ID is invalid.");
  if (!course) return refuse(404, "Course not found");
  if (!universityId || String(course.universityId) !== String(universityId)) return refuse(404, "Course not found");
  return { ok: true, courseId: id };
}

module.exports = { decideCourseSelection };
