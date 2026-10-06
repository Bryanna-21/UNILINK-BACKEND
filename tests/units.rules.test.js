const test = require("node:test");
const assert = require("node:assert/strict");
const r = require("../src/utils/units.rules");

const v = (o) => r.validateProfileFields(o);

test("profile: only the fields provided come back, so a partial update never wipes the rest", () => {
  assert.deepEqual(v({ programme: "BSc ICT" }), { ok: true, update: { programme: "BSc ICT" } });
  assert.deepEqual(v({}), { ok: true, update: {} });
  assert.deepEqual(v(undefined), { ok: true, update: {} });
});

test("profile: text is trimmed, whitespace collapsed, control characters stripped", () => {
  assert.equal(v({ programme: "  BSc   Information \u0000 & Comm  " }).update.programme, "BSc Information & Comm");
  assert.equal(v({ name: "  Bryanna\tManu " }).update.name, "Bryanna Manu");
});

test("profile: name can't be empty or non-text, and is capped", () => {
  assert.equal(v({ name: "   " }).ok, false);
  assert.equal(v({ name: 42 }).ok, false);
  assert.equal(v({ name: null }).ok, false);
  assert.equal(v({ name: "x".repeat(101) }).ok, false);
  assert.equal(v({ name: "x".repeat(100) }).ok, true);
});

test("profile: bio keeps single line breaks, collapses runs, caps at 500, null clears", () => {
  assert.equal(v({ bio: "line one\r\n\r\n\r\n\r\nline two" }).update.bio, "line one\n\nline two");
  assert.equal(v({ bio: "x".repeat(501) }).ok, false);
  assert.equal(v({ bio: "x".repeat(500) }).ok, true);
  assert.equal(v({ bio: null }).update.bio, "");
  assert.equal(v({ bio: 5 }).ok, false);
});

test("profile: phone accepts real formats and rejects anything else", () => {
  for (const good of ["+254 712 345 678", "0712-345-678", "(020) 123.4567", ""]) assert.equal(v({ phone: good }).ok, true, good);
  for (const bad of ["call me", "0712<script>", "x".repeat(31), 7]) assert.equal(v({ phone: bad }).ok, false, String(bad));
});

test("profile: programme is capped at 80 and may be cleared", () => {
  assert.equal(v({ programme: "x".repeat(81) }).ok, false);
  assert.equal(v({ programme: "" }).update.programme, "");
  assert.equal(v({ programme: null }).update.programme, "");
  assert.equal(v({ programme: {} }).ok, false);
});

test("year of study: whole numbers 1 to 6, numeric strings accepted, anything else refused", () => {
  assert.equal(v({ yearOfStudy: 3 }).update.yearOfStudy, 3);
  assert.equal(v({ yearOfStudy: "4" }).update.yearOfStudy, 4);
  assert.equal(v({ yearOfStudy: null }).update.yearOfStudy, null);
  assert.equal(v({ yearOfStudy: "" }).update.yearOfStudy, null);
  for (const bad of [0, 7, -1, 2.5, "2.5", "abc", NaN, Infinity, true, {}, [], "١"]) {
    assert.equal(v({ yearOfStudy: bad }).ok, false, String(bad));
  }
});

test("semester: 1 to 3 only", () => {
  assert.equal(v({ semester: 3 }).update.semester, 3);
  assert.equal(v({ semester: 4 }).ok, false);
  assert.equal(v({ semester: 0 }).ok, false);
});

test("profile: the first invalid field fails the whole request and nothing partial leaks out", () => {
  const out = v({ programme: "Fine", yearOfStudy: 99 });
  assert.equal(out.ok, false);
  assert.equal(out.update, undefined);
});

test("isObjectId", () => {
  assert.equal(r.isObjectId("507f1f77bcf86cd799439011"), true);
  for (const x of ["", "abc", null, undefined, { $ne: 1 }, "507f1f77bcf86cd79943901z"]) assert.equal(r.isObjectId(x), false);
});

test("cleanQuery caps length and strips control characters", () => {
  assert.equal(r.cleanQuery("  data\u0007  structures "), "data structures");
  assert.equal(r.cleanQuery("x".repeat(80)).length, 50);
  assert.equal(r.cleanQuery(undefined), "");
});

const student = { _id: "s1", role: "student", universityId: "uniA" };
const course = { _id: "c1", universityId: "uniA", enrolledStudentIds: [] };

test("canEnroll: students only; others get 403, deleted or missing accounts 401", () => {
  assert.equal(r.canEnroll({ viewer: { ...student, role: "lecturer" }, course, enrolledCount: 0 }).status, 403);
  assert.equal(r.canEnroll({ viewer: { ...student, role: "admin" }, course, enrolledCount: 0 }).status, 403);
  assert.equal(r.canEnroll({ viewer: null, course, enrolledCount: 0 }).status, 401);
  assert.equal(r.canEnroll({ viewer: { ...student, deletedAt: new Date() }, course, enrolledCount: 0 }).status, 401);
});

test("canEnroll: another university's course, or a legacy course with no university, answers 404", () => {
  assert.equal(r.canEnroll({ viewer: student, course: { ...course, universityId: "uniB" }, enrolledCount: 0 }).status, 404);
  assert.equal(r.canEnroll({ viewer: student, course: { ...course, universityId: undefined }, enrolledCount: 0 }).status, 404);
  assert.equal(r.canEnroll({ viewer: { ...student, universityId: undefined }, course, enrolledCount: 0 }).status, 404);
  assert.equal(r.canEnroll({ viewer: student, course: null, enrolledCount: 0 }).status, 404);
});

test("canEnroll: the cap blocks the 16th unit, but a repeat enrol is still a success", () => {
  assert.equal(r.canEnroll({ viewer: student, course, enrolledCount: 14 }).ok, true);
  const full = r.canEnroll({ viewer: student, course, enrolledCount: 15 });
  assert.equal(full.status, 409);
  assert.match(full.message, /at most 15/);
  assert.deepEqual(r.canEnroll({ viewer: student, course, enrolledCount: 15, alreadyEnrolled: true }), { ok: true, already: true });
});

test("canViewCourse: student = enrolled or same university", () => {
  assert.equal(r.canViewCourse({ viewer: student, course }), true);
  assert.equal(r.canViewCourse({ viewer: student, course: { ...course, universityId: "uniB" } }), false);
  assert.equal(r.canViewCourse({ viewer: student, course: { ...course, universityId: "uniB", enrolledStudentIds: ["s1"] } }), true, "membership wins");
  assert.equal(r.canViewCourse({ viewer: student, course: { ...course, universityId: undefined } }), false);
});

test("canViewCourse: lecturer = owner or same university; admins unchanged", () => {
  const lec = { _id: "l1", role: "lecturer", universityId: "uniA" };
  assert.equal(r.canViewCourse({ viewer: lec, course }), true);
  assert.equal(r.canViewCourse({ viewer: lec, course: { ...course, universityId: "uniB" } }), false);
  assert.equal(r.canViewCourse({ viewer: lec, course: { ...course, universityId: "uniB", lecturerId: "l1" } }), true);
  const admin = { _id: "a1", role: "admin", universityId: "uniZ" };
  assert.equal(r.canViewCourse({ viewer: admin, course }), true);
  assert.equal(r.canViewCourse({ viewer: { ...admin, role: "superadmin" }, course }), true);
});

test("shapeCourse: a student sees only themselves; the count stays real", () => {
  const c = { ...course, enrolledStudentIds: ["s1", "s2", "s3"] };
  const out = r.shapeCourse({ course: c, viewer: student });
  assert.deepEqual(out.enrolledStudentIds, ["s1"]);
  assert.equal(out.enrolledCount, 3);
  assert.deepEqual(r.shapeCourse({ course: { ...c, enrolledStudentIds: ["s2"] }, viewer: student }).enrolledStudentIds, []);
  assert.deepEqual(c.enrolledStudentIds, ["s1", "s2", "s3"], "input is not mutated");
});

test("shapeCourse: owner lecturer and admin see the full list; another lecturer sees none", () => {
  const c = { ...course, lecturerId: "l1", enrolledStudentIds: ["s1", "s2"] };
  assert.deepEqual(r.shapeCourse({ course: c, viewer: { _id: "l1", role: "lecturer" } }).enrolledStudentIds, ["s1", "s2"]);
  assert.deepEqual(r.shapeCourse({ course: c, viewer: { _id: "l2", role: "lecturer" } }).enrolledStudentIds, []);
  assert.deepEqual(r.shapeCourse({ course: c, viewer: { _id: "a1", role: "admin" } }).enrolledStudentIds, ["s1", "s2"]);
});

test("shapeCourse: works on mongoose-style documents and honours the kill switch", () => {
  const doc = { toObject: () => ({ ...course, enrolledStudentIds: ["s1", "s2"] }) };
  assert.deepEqual(r.shapeCourse({ course: doc, viewer: student }).enrolledStudentIds, ["s1"]);
  assert.deepEqual(r.shapeCourse({ course: doc, viewer: student, exposeIds: true }).enrolledStudentIds, ["s1", "s2"]);
});
