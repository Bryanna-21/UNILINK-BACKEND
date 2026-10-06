const test = require("node:test");
const assert = require("node:assert/strict");
const { createUnitsCore } = require("../src/services/units.core");

// In-memory stand-in for units.repo.js. It honours the same contract. These tests exercise the
// decision layer; they do NOT prove the mongoose queries in units.repo.js (that needs a real database).
const oid = (n) => String(n).padStart(24, "0");
const U = {
  s1: oid(1), s2: oid(2), s3: oid(3), lec: oid(10), lec2: oid(11), adm: oid(20), foreign: oid(30), ghost: oid(99),
};
const C = { ds: oid(101), net: oid(102), db: oid(103), other: oid(104), legacy: oid(105), a: oid(111) };

function makeRepo({ users, courses }) {
  const db = { users: new Map(users.map((u) => [u._id, { ...u }])), courses: new Map(courses.map((c) => [c._id, { ...c, enrolledStudentIds: [...(c.enrolledStudentIds || [])] }])) };
  const calls = { add: 0, remove: 0 };
  return {
    db, calls,
    async userById(id) { return db.users.get(String(id)) || null; },
    async usersByIds(ids) { return ids.map((i) => db.users.get(i)).filter(Boolean); },
    async courseById(id) { const c = db.courses.get(String(id)); return c ? { ...c, enrolledStudentIds: [...c.enrolledStudentIds] } : null; },
    async listCoursesFor({ role, userId }) {
      return [...db.courses.values()].filter((c) => (role === "student" ? c.enrolledStudentIds.includes(userId) : role === "lecturer" ? c.lecturerId === userId : true));
    },
    async searchCourses({ universityId, q, limit }) {
      calls.search = { universityId, q, limit };
      return [...db.courses.values()]
        .filter((c) => c.universityId === universityId)
        .filter((c) => !q || c.title.toLowerCase().includes(q.toLowerCase()) || (c.code || "").toLowerCase().includes(q.toLowerCase()))
        .sort((a, b) => a.title.localeCompare(b.title))
        .slice(0, limit);
    },
    async countEnrolled(userId) { return [...db.courses.values()].filter((c) => c.enrolledStudentIds.includes(userId)).length; },
    async addEnrollment(courseId, userId) {
      calls.add += 1;
      const c = db.courses.get(courseId);
      if (c.enrolledStudentIds.includes(userId)) return false;
      c.enrolledStudentIds.push(userId);
      return true;
    },
    async removeEnrollment(courseId, userId) {
      calls.remove += 1;
      const c = db.courses.get(courseId);
      const had = c.enrolledStudentIds.includes(userId);
      c.enrolledStudentIds = c.enrolledStudentIds.filter((x) => x !== userId);
      return had;
    },
  };
}

const seed = () => ({
  users: [
    { _id: U.s1, name: "Ann", role: "student", universityId: "uniA" },
    { _id: U.s2, name: "Ben", role: "student", universityId: "uniA" },
    { _id: U.s3, name: "Cy", role: "student", universityId: "uniB" },
    { _id: U.lec, name: "Dr Okoth", role: "lecturer", universityId: "uniA" },
    { _id: U.lec2, name: "Dr Njoki", role: "lecturer", universityId: "uniA" },
    { _id: U.adm, name: "Admin", role: "admin", universityId: "uniA" },
    { _id: U.foreign, name: "Gone", role: "student", universityId: "uniA", deletedAt: new Date() },
  ],
  courses: [
    { _id: C.ds, title: "Data Structures", code: "BIT 2101", universityId: "uniA", lecturerId: U.lec, enrolledStudentIds: [U.s1, U.s2], description: "Trees and graphs" },
    { _id: C.net, title: "Networks", code: "BIT 2102", universityId: "uniA", lecturerId: U.lec, enrolledStudentIds: [] },
    { _id: C.db, title: "Databases", code: "BIT 2103", universityId: "uniA", lecturerId: U.lec2, enrolledStudentIds: [U.s2] },
    { _id: C.other, title: "Other Uni Course", code: "X1", universityId: "uniB", lecturerId: U.lec, enrolledStudentIds: [] },
    { _id: C.legacy, title: "Legacy", code: "L1", lecturerId: U.lec, enrolledStudentIds: [] },
  ],
});
const make = (cfg) => { const repo = makeRepo(seed()); return { repo, core: createUnitsCore({ repo, config: cfg }) }; };

// ---- list ----------------------------------------------------------------------------
test("list: a student gets only their courses, and only their own id inside each", async () => {
  const { core } = make();
  const r = await core.listCourses(U.s1);
  assert.equal(r.count, 1);
  assert.deepEqual(r.data[0].enrolledStudentIds, [U.s1], "classmates' ids are not sent");
  assert.equal(r.data[0].enrolledCount, 2);
  assert.ok(r.data[0].enrolledStudentIds.includes(U.s1), "the client-side 'am I enrolled' filter still works");
});

test("list: a lecturer gets their own courses with full rosters; admins get every course", async () => {
  const { core } = make();
  const lec = await core.listCourses(U.lec);
  assert.deepEqual(lec.data.map((c) => c._id).sort(), [C.ds, C.net, C.other, C.legacy].sort());
  assert.deepEqual(lec.data.find((c) => c._id === C.ds).enrolledStudentIds, [U.s1, U.s2]);
  assert.equal((await core.listCourses(U.adm)).count, 5);
});

test("list: an unknown or deleted account is refused", async () => {
  const { core } = make();
  assert.equal((await core.listCourses(U.ghost)).status, 401);
  assert.equal((await core.listCourses(U.foreign)).status, 401);
});

test("list: the kill switch restores the old full id lists", async () => {
  const { core } = make({ exposeEnrolmentIds: true });
  assert.deepEqual((await core.listCourses(U.s1)).data[0].enrolledStudentIds, [U.s1, U.s2]);
});

// ---- get one ------------------------------------------------------------------------
test("getCourse: a bad id is 400, a missing course 404", async () => {
  const { core } = make();
  assert.equal((await core.getCourse(U.s1, "nope")).status, 400);
  assert.equal((await core.getCourse(U.s1, { $ne: 1 })).status, 400, "an operator object is not an id");
  assert.equal((await core.getCourse(U.s1, oid(555))).status, 404);
});

test("getCourse: a student can open their own university's courses, sanitised, but not another university's", async () => {
  const { core } = make();
  const own = await core.getCourse(U.s1, C.ds);
  assert.equal(own.ok, true);
  assert.deepEqual(own.data.enrolledStudentIds, [U.s1]);
  const browse = await core.getCourse(U.s1, C.net);
  assert.equal(browse.ok, true, "same university, not enrolled: may look before enrolling");
  assert.deepEqual(browse.data.enrolledStudentIds, []);
  const foreign = await core.getCourse(U.s1, C.other);
  assert.equal(foreign.status, 404, "answers exactly like a course that doesn't exist");
  assert.equal(foreign.message, "Course not found");
  assert.equal((await core.getCourse(U.s1, C.legacy)).status, 404);
});

test("getCourse: the owner lecturer sees the roster; a different lecturer sees none; admin sees all", async () => {
  const { core } = make();
  assert.deepEqual((await core.getCourse(U.lec, C.ds)).data.enrolledStudentIds, [U.s1, U.s2]);
  assert.deepEqual((await core.getCourse(U.lec2, C.ds)).data.enrolledStudentIds, []);
  assert.deepEqual((await core.getCourse(U.adm, C.ds)).data.enrolledStudentIds, [U.s1, U.s2]);
  assert.equal((await core.getCourse(U.adm, C.other)).ok, true, "admin behaviour is unchanged");
});

test("getCourse: switching access enforcement off restores the old open behaviour", async () => {
  const { core } = make({ enforceAccess: false });
  assert.equal((await core.getCourse(U.s1, C.other)).ok, true);
});

// ---- available ----------------------------------------------------------------------
test("available: only the student's university, alphabetical, with isEnrolled and lecturer names, and no id lists", async () => {
  const { core, repo } = make();
  const r = await core.available(U.s1, "");
  assert.deepEqual(r.data.map((c) => c.title), ["Data Structures", "Databases", "Networks"]);
  assert.equal(repo.calls.search.universityId, "uniA");
  assert.equal(r.data[0].isEnrolled, true);
  assert.equal(r.data[2].isEnrolled, false);
  assert.equal(r.data[0].lecturerName, "Dr Okoth");
  assert.equal(r.data[0].enrolledCount, 2);
  for (const c of r.data) {
    assert.equal(c.enrolledStudentIds, undefined);
    assert.deepEqual(Object.keys(c).sort(), ["_id", "code", "description", "enrolledCount", "isEnrolled", "lecturerName", "title"]);
  }
});

test("available: search by title or code, and the query is cleaned and capped", async () => {
  const { core, repo } = make();
  assert.deepEqual((await core.available(U.s1, "net")).data.map((c) => c.title), ["Networks"]);
  assert.deepEqual((await core.available(U.s1, "bit 2103")).data.map((c) => c.title), ["Databases"]);
  await core.available(U.s1, "x".repeat(200));
  assert.equal(repo.calls.search.q.length, 50);
});

test("available: students only; a student with no university gets an empty list", async () => {
  const { core, repo } = make();
  assert.equal((await core.available(U.lec, "")).status, 403);
  assert.equal((await core.available(U.adm, "")).status, 403);
  assert.equal((await core.available(U.ghost, "")).status, 401);
  repo.db.users.get(U.s1).universityId = undefined;
  assert.deepEqual(await core.available(U.s1, ""), { ok: true, count: 0, data: [] });
});

// ---- enrol --------------------------------------------------------------------------
test("enrol: a student joins a unit at their own university; the answer shows only themselves", async () => {
  const { core, repo } = make();
  const r = await core.enroll(U.s1, C.net);
  assert.equal(r.ok, true);
  assert.equal(r.alreadyEnrolled, false);
  assert.deepEqual(r.data.enrolledStudentIds, [U.s1]);
  assert.deepEqual(repo.db.courses.get(C.net).enrolledStudentIds, [U.s1]);
});

test("enrol: repeating it is a harmless success and writes nothing", async () => {
  const { core, repo } = make();
  const r = await core.enroll(U.s1, C.ds);
  assert.equal(r.ok, true);
  assert.equal(r.alreadyEnrolled, true);
  assert.equal(repo.calls.add, 0);
  assert.equal(repo.db.courses.get(C.ds).enrolledStudentIds.filter((x) => x === U.s1).length, 1);
});

test("enrol: lecturers, admins and ghosts can't; another university's course answers 404; legacy course 404", async () => {
  const { core } = make();
  assert.equal((await core.enroll(U.lec, C.net)).status, 403);
  assert.equal((await core.enroll(U.adm, C.net)).status, 403);
  assert.equal((await core.enroll(U.ghost, C.net)).status, 401);
  assert.equal((await core.enroll(U.s1, C.other)).status, 404);
  assert.equal((await core.enroll(U.s1, C.legacy)).status, 404);
  assert.equal((await core.enroll(U.s1, oid(777))).status, 404);
  assert.equal((await core.enroll(U.s1, "bad")).status, 400);
});

test("enrol: the cap stops the 16th unit but never blocks a repeat of one you already have", async () => {
  const seedData = seed();
  for (let i = 0; i < 15; i += 1) {
    seedData.courses.push({ _id: oid(200 + i), title: `Unit ${i}`, code: `U${i}`, universityId: "uniA", lecturerId: U.lec, enrolledStudentIds: [U.s1] });
  }
  // s1 is now in ds plus 15 more = 16 would exceed; rebuild precisely: remove s1 from ds so s1 has exactly 15
  seedData.courses.find((c) => c._id === C.ds).enrolledStudentIds = [U.s2];
  const repo = makeRepo(seedData);
  const core = createUnitsCore({ repo });
  const blocked = await core.enroll(U.s1, C.net);
  assert.equal(blocked.status, 409);
  assert.match(blocked.message, /at most 15/);
  const again = await core.enroll(U.s1, oid(200));
  assert.equal(again.ok, true, "already enrolled: still a success");
  await core.unenroll(U.s1, oid(200));
  assert.equal((await core.enroll(U.s1, C.net)).ok, true, "dropping one makes room");
});

test("enrol: the feature switch turns both enrol and unenrol off", async () => {
  const { core, repo } = make({ unitEnrolmentEnabled: false });
  assert.equal((await core.enroll(U.s1, C.net)).status, 403);
  assert.equal((await core.unenroll(U.s1, C.ds)).status, 403);
  assert.equal(repo.calls.add + repo.calls.remove, 0);
});

// ---- unenrol ------------------------------------------------------------------------
test("unenrol: removes only the caller, and is idempotent", async () => {
  const { core, repo } = make();
  const first = await core.unenroll(U.s1, C.ds);
  assert.deepEqual(first.data, { enrolled: false, wasEnrolled: true });
  assert.deepEqual(repo.db.courses.get(C.ds).enrolledStudentIds, [U.s2], "a classmate is untouched");
  const second = await core.unenroll(U.s1, C.ds);
  assert.deepEqual(second.data, { enrolled: false, wasEnrolled: false });
});

test("unenrol: students only; unknown course 404; bad id 400", async () => {
  const { core } = make();
  assert.equal((await core.unenroll(U.lec, C.ds)).status, 403);
  assert.equal((await core.unenroll(U.ghost, C.ds)).status, 401);
  assert.equal((await core.unenroll(U.s1, oid(777))).status, 404);
  assert.equal((await core.unenroll(U.s1, "bad")).status, 400);
});

test("enrol then drop then enrol again works, and leaves exactly one entry", async () => {
  const { core, repo } = make();
  await core.enroll(U.s1, C.net);
  await core.unenroll(U.s1, C.net);
  await core.enroll(U.s1, C.net);
  assert.deepEqual(repo.db.courses.get(C.net).enrolledStudentIds, [U.s1]);
});
