"use strict";
// Runs the REAL updateMyProfile controller with only the database methods faked, to prove the selected course is
// validated, persisted and returned, and that switching institution clears the old course.
const test = require("node:test");
const assert = require("node:assert/strict");

const User = require("../src/models/User");
const University = require("../src/models/University");
const Course = require("../src/models/Course");
const profileController = require("../src/controllers/profile.controller");

const hex = (n) => String(n).padStart(24, "0");
const UNI_A = hex(101), UNI_B = hex(102);
const COURSE_A = hex(201), COURSE_B = hex(202), COURSE_GHOST = hex(299);
const ME = hex(1);

const chain = (v, onSelect) => {
  const o = { select: (f) => { if (onSelect) onSelect(f); return o; }, lean: () => o, then: (res, rej) => Promise.resolve(v).then(res, rej) };
  return o;
};

function setup(me) {
  const saved = [];
  const patch = (obj, name, fn) => { saved.push([obj, name, obj[name]]); obj[name] = fn; };
  const rec = { writes: [], selects: [], pulls: [] };
  patch(User, "findById", () => chain(me ? { ...me } : null));
  patch(User, "findByIdAndUpdate", (id, op) => { rec.writes.push(op.$set); return chain({ _id: ME, ...me, ...op.$set }, (f) => rec.selects.push(f)); });
  patch(University, "exists", async (f) => (String(f._id) === UNI_A || String(f._id) === UNI_B ? { _id: f._id } : null));
  const courses = { [COURSE_A]: { universityId: UNI_A, title: "Diploma in Nursing (KRCHN)" }, [COURSE_B]: { universityId: UNI_B, title: "Diploma in ICT" } };
  patch(Course, "findById", (id) => chain(courses[String(id)] ? { _id: id, ...courses[String(id)] } : null));
  patch(Course, "updateMany", async (filter, op) => { rec.pulls.push({ filter, op }); return {}; });
  return { rec, restore: () => saved.reverse().forEach(([o, n, f]) => { o[n] = f; }) };
}

const call = async (body, role = "student") => {
  const out = { status: 200, body: null };
  const res = { status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; } };
  await profileController.updateMyProfile({ body, user: { id: ME, role, universityId: UNI_A } }, res);
  return out;
};

const finished = { role: "student", universityId: UNI_A, courseId: COURSE_A, programme: "Diploma in Nursing (KRCHN)", yearOfStudy: 2, semester: 1, onboardingCompletedAt: new Date() };
const midSetup = { role: "student", universityId: UNI_A, courseId: null, programme: "", yearOfStudy: null, semester: null, onboardingCompletedAt: null };

test("a valid course at the student's institution is saved, and the programme defaults to its title", async () => {
  const s = setup(midSetup);
  try {
    const r = await call({ courseId: COURSE_A });
    assert.equal(r.status, 200);
    assert.equal(s.rec.writes[0].courseId, COURSE_A);
    assert.equal(s.rec.writes[0].programme, "Diploma in Nursing (KRCHN)");
    assert.equal(r.body.data.courseId, COURSE_A, "returned to the client");
  } finally { s.restore(); }
});
test("an explicit programme is kept, not replaced by the course title", async () => {
  const s = setup(midSetup);
  try {
    await call({ courseId: COURSE_A, programme: "Nursing (my words)" });
    assert.equal(s.rec.writes[0].programme, "Nursing (my words)");
  } finally { s.restore(); }
});
test("the response select includes courseId and campusId", async () => {
  const s = setup(midSetup);
  try {
    await call({ courseId: COURSE_A });
    assert.match(s.rec.selects[0], /\bcourseId\b/);
    assert.match(s.rec.selects[0], /\bcampusId\b/);
  } finally { s.restore(); }
});
test("invalid course ids are 400 and nothing is written", async () => {
  for (const bad of ["not-an-id", "$ne", 5, { $ne: "" }, ["x"]]) {
    const s = setup(midSetup);
    try {
      assert.equal((await call({ courseId: bad })).status, 400, JSON.stringify(bad));
      assert.equal(s.rec.writes.length, 0);
    } finally { s.restore(); }
  }
});
test("a course that does not exist is 404", async () => {
  const s = setup(midSetup);
  try {
    assert.equal((await call({ courseId: COURSE_GHOST })).status, 404);
    assert.equal(s.rec.writes.length, 0);
  } finally { s.restore(); }
});
test("a course at another institution is refused (institution mismatch)", async () => {
  const s = setup(midSetup);
  try {
    assert.equal((await call({ courseId: COURSE_B })).status, 404);
    assert.equal(s.rec.writes.length, 0);
  } finally { s.restore(); }
});
test("a student may choose the new institution's course in the same save as switching institution", async () => {
  const s = setup(midSetup);
  try {
    const r = await call({ universityId: UNI_B, courseId: COURSE_B });
    assert.equal(r.status, 200);
    assert.equal(s.rec.writes[0].universityId, UNI_B);
    assert.equal(s.rec.writes[0].courseId, COURSE_B);
  } finally { s.restore(); }
});
test("switching institution while keeping the old institution's course is refused", async () => {
  const s = setup({ ...midSetup, courseId: COURSE_A });
  try {
    assert.equal((await call({ universityId: UNI_B, courseId: COURSE_A })).status, 404);
    assert.equal(s.rec.writes.length, 0);
  } finally { s.restore(); }
});
test("switching institution clears the old course and programme, keeps year and semester, and drops old enrolments", async () => {
  // Mid-setup (no semester yet), so the university lock still allows the switch.
  const s = setup({ ...midSetup, courseId: COURSE_A, programme: "Diploma in Nursing (KRCHN)", yearOfStudy: 2, semester: null });
  try {
    const r = await call({ universityId: UNI_B });
    assert.equal(r.status, 200);
    assert.equal(s.rec.writes[0].courseId, null);
    assert.equal(s.rec.writes[0].programme, "");
    assert.equal("yearOfStudy" in s.rec.writes[0], false, "year preserved");
    assert.equal("semester" in s.rec.writes[0], false, "semester preserved");
    assert.equal(s.rec.pulls.length, 1);
    assert.deepEqual(s.rec.pulls[0].filter.universityId, { $nin: [UNI_B, null] });
    assert.deepEqual(s.rec.pulls[0].op, { $pull: { enrolledStudentIds: ME } });
  } finally { s.restore(); }
});
test("a normal save keeps course, programme, year and semester untouched", async () => {
  const s = setup(finished);
  try {
    const r = await call({ bio: "hello" });
    assert.equal(r.status, 200);
    for (const k of ["courseId", "programme", "yearOfStudy", "semester"]) assert.equal(k in s.rec.writes[0], false, k);
    assert.equal(s.rec.pulls.length, 0);
  } finally { s.restore(); }
});
test("saving year and semester alongside the course preserves them", async () => {
  const s = setup(midSetup);
  try {
    await call({ courseId: COURSE_A, yearOfStudy: 2, semester: 1, onboardingCompleted: true });
    assert.equal(s.rec.writes[0].yearOfStudy, 2);
    assert.equal(s.rec.writes[0].semester, 1);
    assert.equal(s.rec.writes[0].courseId, COURSE_A);
  } finally { s.restore(); }
});
test("null clears the course; staff cannot choose one", async () => {
  let s = setup(finished);
  try {
    const r = await call({ courseId: null });
    assert.equal(r.status, 200);
    assert.equal(s.rec.writes[0].courseId, null);
  } finally { s.restore(); }
  for (const role of ["lecturer", "admin", "superadmin"]) {
    s = setup({ ...midSetup, role });
    try {
      assert.equal((await call({ courseId: COURSE_A }, role)).status, 403, role);
      assert.equal(s.rec.writes.length, 0);
    } finally { s.restore(); }
  }
});
