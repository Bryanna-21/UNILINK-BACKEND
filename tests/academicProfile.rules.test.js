"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { decideCourseSelection } = require("../src/utils/academicProfile.rules");

const UNI = "a".repeat(24), OTHER = "b".repeat(24), COURSE = "c".repeat(24);
const student = { role: "student" };
const course = { universityId: UNI, title: "Diploma in Nursing (KRCHN)" };

test("a valid course at the student's institution is accepted", () => {
  assert.deepEqual(decideCourseSelection({ user: student, courseId: COURSE, course, universityId: UNI }), { ok: true, courseId: COURSE });
});
test("the id is trimmed", () => {
  assert.equal(decideCourseSelection({ user: student, courseId: ` ${COURSE} `, course, universityId: UNI }).courseId, COURSE);
});
test("null or empty clears the selection", () => {
  assert.deepEqual(decideCourseSelection({ user: student, courseId: null, universityId: UNI }), { ok: true, courseId: null });
  assert.deepEqual(decideCourseSelection({ user: student, courseId: "", universityId: UNI }), { ok: true, courseId: null });
});
test("invalid ids are 400", () => {
  for (const bad of ["nope", "$ne", "a".repeat(23), 5, {}, ["x"]]) {
    const r = decideCourseSelection({ user: student, courseId: bad, course: null, universityId: UNI });
    assert.equal(r.ok, false, String(bad)); assert.equal(r.status, 400, String(bad));
  }
});
test("a course that does not exist is 404", () => {
  assert.equal(decideCourseSelection({ user: student, courseId: COURSE, course: null, universityId: UNI }).status, 404);
});
test("a course at another institution is 404 (no probing)", () => {
  assert.equal(decideCourseSelection({ user: student, courseId: COURSE, course: { universityId: OTHER }, universityId: UNI }).status, 404);
});
test("a legacy course with no institution never matches", () => {
  assert.equal(decideCourseSelection({ user: student, courseId: COURSE, course: { universityId: undefined }, universityId: UNI }).status, 404);
});
test("a student with no institution cannot pick a course", () => {
  assert.equal(decideCourseSelection({ user: student, courseId: COURSE, course, universityId: undefined }).status, 404);
});
test("staff cannot pick a course", () => {
  for (const role of ["lecturer", "admin", "superadmin"]) {
    assert.equal(decideCourseSelection({ user: { role }, courseId: COURSE, course, universityId: UNI }).status, 403);
  }
  assert.equal(decideCourseSelection({ user: null, courseId: COURSE, course, universityId: UNI }).status, 403);
});
