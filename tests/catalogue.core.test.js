"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createCatalogueCore } = require("../src/services/catalogue.core");

// In-memory repo with the same contract as catalogue.repo.js.
function makeRepo() {
  const db = { users: new Map(), institutions: [], courses: [], units: [], n: 1 };
  const id = () => String(db.n++).padStart(24, "0");
  const writes = { count: 0 };
  const w = () => { writes.count += 1; };
  const key = (s) => String(s).toLowerCase();
  const repo = {
    db, writes, id,
    async userById(x) { return db.users.get(String(x)) || null; },
    async listInstitutions() { return db.institutions.map((i) => ({ ...i })); },
    async createInstitution({ name, institutionType }) { w(); const d = { _id: id(), name, institutionType, verified: false, status: "active" }; db.institutions.push(d); return { ...d }; },
    async fillInstitutionType(i, t) { w(); const d = db.institutions.find((x) => x._id === String(i)); if (!d.institutionType) d.institutionType = t; },
    async institutionById(x) { const d = db.institutions.find((i) => i._id === String(x)); return d ? { ...d } : null; },
    async searchInstitutions({ institutionType, q, limit }) {
      return db.institutions.filter((i) => (!institutionType || i.institutionType === institutionType) && (!q || key(i.name).includes(q))).slice(0, limit).map((i) => ({ ...i }));
    },
    async listCourses(u) { return db.courses.filter((c) => c.universityId === String(u)).map((c) => ({ ...c })); },
    async createCourse(d) { w(); const c = { _id: id(), enrolledStudentIds: [], verificationStatus: "needs_verification", ...d, universityId: String(d.universityId) }; db.courses.push(c); return { ...c }; },
    async fillCourse(i, fields) { w(); const c = db.courses.find((x) => x._id === String(i)); for (const [k, v] of Object.entries(fields)) if (c[k] === null || c[k] === undefined || c[k] === "") c[k] = v; },
    async updateCourse(i, set) { w(); Object.assign(db.courses.find((x) => x._id === String(i)), set); },
    async courseById(x) { const c = db.courses.find((d) => d._id === String(x)); return c ? { ...c } : null; },
    async searchCourses({ universityId, level, q, limit }) {
      return db.courses.filter((c) => c.universityId === String(universityId) && (!level || c.level === level) && (!q || key(c.title).includes(key(q)))).slice(0, limit).map((c) => ({ ...c }));
    },
    async enrolledCourses(uid, uni) { return db.courses.filter((c) => c.universityId === String(uni) && c.enrolledStudentIds.includes(String(uid))).map((c) => ({ ...c })); },
    async setCourseIfEmpty(uid, cid) { w(); const u = db.users.get(String(uid)); if (!u.courseId) u.courseId = String(cid); },
    async unitCodesOfCourse(c) { return db.units.filter((u) => u.courseId === String(c)).map((u) => u.code); },
    async insertUnits(c, uni, units, source) {
      w();
      for (const u of units) if (!db.units.some((x) => x.courseId === String(c) && x.code === u.code)) db.units.push({ _id: id(), ...u, courseId: String(c), universityId: String(uni), verificationStatus: "needs_verification", source });
    },
    async upsertUnits(c, uni, units, status, source) {
      w(); let created = 0, updated = 0;
      for (const u of units) {
        const ex = db.units.find((x) => x.courseId === String(c) && x.code === u.code);
        if (ex) { Object.assign(ex, u, { verificationStatus: status, source }); updated += 1; }
        else { db.units.push({ _id: id(), ...u, courseId: String(c), universityId: String(uni), verificationStatus: status, source }); created += 1; }
      }
      return { created, updated };
    },
    async setUnitsVerification(c, status) { let n = 0; for (const u of db.units) if (u.courseId === String(c)) { u.verificationStatus = status; n += 1; } return n; },
    async unitsOfCourse(c) { return db.units.filter((u) => u.courseId === String(c)).map((u) => ({ ...u })); },
    async unitCounts(ids) { const o = {}; for (const u of db.units) if (ids.includes(u.courseId)) o[u.courseId] = (o[u.courseId] || 0) + 1; return o; },
  };
  return repo;
}

const INSTS = [
  { name: "Kenya Medical Training College", institutionType: "medical_training" },
  { name: "The Kabete National Polytechnic", institutionType: "national_polytechnic" },
  { name: "Strathmore University", institutionType: "university_private" },
];
const TEMPLATES = [
  { code: "DIP-NURS", title: "Diploma in Nursing (KRCHN)", level: "diploma", durationYears: 3, semestersPerYear: 2, appliesTo: { types: ["medical_training"] }, curriculum: "nurs" },
  { code: "DIP-ICT", title: "Diploma in Information Communication Technology", level: "diploma", durationYears: 2, semestersPerYear: 3, appliesTo: { types: ["national_polytechnic", "university_private"] }, curriculum: null },
  { code: "BSc-IT", title: "Bachelor of Science in Information Technology", level: "degree", durationYears: 4, semestersPerYear: 2, appliesTo: { types: ["university_private"] }, curriculum: null },
];
const CURRICULA = { nurs: [
  { code: "N111", name: "Anatomy", credits: 3, yearOfStudy: 1, semester: 1 },
  { code: "N121", name: "Pharmacology", credits: 3, yearOfStudy: 1, semester: 2 },
] };
const run = (core, extra = {}) => core.seed({ institutions: INSTS, templates: TEMPLATES, curricula: CURRICULA, ...extra });

// ── seeding ──
test("seed creates institutions, courses and units, all needing verification", async () => {
  const repo = makeRepo(); const core = createCatalogueCore({ repo });
  const s = await run(core);
  assert.deepEqual(s.institutions, { created: 3, matched: 0, typed: 0 });
  assert.equal(s.courses.created, 1 + 1 + 2);
  assert.equal(s.units.created, 2);
  assert.ok(repo.db.courses.every((c) => c.verificationStatus === "needs_verification"));
  assert.ok(repo.db.units.every((u) => u.verificationStatus === "needs_verification"));
  assert.ok(repo.db.institutions.every((i) => i.verified === false));
});
test("seed is idempotent: a second run creates nothing", async () => {
  const repo = makeRepo(); const core = createCatalogueCore({ repo });
  await run(core);
  const before = JSON.stringify(repo.db);
  const s = await run(core);
  assert.equal(s.institutions.created + s.courses.created + s.units.created, 0);
  assert.equal(JSON.stringify(repo.db), before, "database unchanged");
});
test("a course that already exists by code is matched, not duplicated, and only gets missing fields filled", async () => {
  const repo = makeRepo(); const core = createCatalogueCore({ repo });
  const inst = await repo.createInstitution({ name: "Strathmore University", institutionType: null });
  await repo.createCourse({ universityId: inst._id, code: "bsc-it", title: "BSc Info Tech (my own title)", enrolledStudentIds: ["u1"] });
  const s = await run(core);
  const courses = repo.db.courses.filter((c) => c.universityId === inst._id && /it/i.test(c.code) && c.code.toLowerCase() === "bsc-it");
  assert.equal(courses.length, 1, "no duplicate");
  assert.equal(courses[0].title, "BSc Info Tech (my own title)", "title never overwritten");
  assert.equal(courses[0].level, "degree", "level filled");
  assert.equal(courses[0].durationYears, 4);
  assert.deepEqual(courses[0].enrolledStudentIds, ["u1"]);
  assert.ok(s.courses.filled >= 1);
});
test("a course that already exists by title (different code) is matched, not duplicated", async () => {
  const repo = makeRepo(); const core = createCatalogueCore({ repo });
  const inst = await repo.createInstitution({ name: "Strathmore University", institutionType: "university_private" });
  await repo.createCourse({ universityId: inst._id, code: "OLD-CODE", title: "diploma in information communication technology" });
  await run(core);
  assert.equal(repo.db.courses.filter((c) => c.universityId === inst._id && /information communication/i.test(c.title)).length, 1);
});
test("an already-verified course is never downgraded", async () => {
  const repo = makeRepo(); const core = createCatalogueCore({ repo });
  const inst = await repo.createInstitution({ name: "Strathmore University", institutionType: "university_private" });
  const c = await repo.createCourse({ universityId: inst._id, code: "BSc-IT", title: "Bachelor of Science in Information Technology", verificationStatus: "verified" });
  await run(core);
  assert.equal(repo.db.courses.find((x) => x._id === c._id).verificationStatus, "verified");
});
test("existing institutions are matched by name (ignoring 'The') and typed only when untyped", async () => {
  const repo = makeRepo(); const core = createCatalogueCore({ repo });
  await repo.createInstitution({ name: "Kabete National Polytechnic", institutionType: null });
  await repo.createInstitution({ name: "Strathmore University", institutionType: "university_public" }); // already typed: keep
  const s = await run(core);
  assert.equal(repo.db.institutions.filter((i) => /kabete/i.test(i.name)).length, 1);
  assert.equal(repo.db.institutions.find((i) => /kabete/i.test(i.name)).institutionType, "national_polytechnic");
  assert.equal(repo.db.institutions.find((i) => /strathmore/i.test(i.name)).institutionType, "university_public");
  assert.equal(s.institutions.typed, 1);
});
test("units are only seeded into a course that has none", async () => {
  const repo = makeRepo(); const core = createCatalogueCore({ repo });
  const inst = await repo.createInstitution({ name: "Kenya Medical Training College", institutionType: "medical_training" });
  const c = await repo.createCourse({ universityId: inst._id, code: "DIP-NURS", title: "Diploma in Nursing (KRCHN)" });
  await repo.insertUnits(c._id, inst._id, [{ code: "REAL1", name: "Real unit", yearOfStudy: 1, semester: 1, credits: 3 }], "admin-import");
  const s = await run(core);
  assert.equal(s.units.coursesAlreadyHadUnits, 1);
  assert.deepEqual(repo.db.units.filter((u) => u.courseId === c._id).map((u) => u.code), ["REAL1"]);
});
test("dry run reports counts but writes nothing", async () => {
  const repo = makeRepo(); const core = createCatalogueCore({ repo });
  const s = await run(core, { dryRun: true });
  assert.equal(s.dryRun, true);
  assert.equal(s.institutions.created, 3);
  assert.ok(s.courses.created >= 4 && s.units.created === 2);
  assert.equal(repo.writes.count, 0);
  assert.equal(repo.db.institutions.length + repo.db.courses.length + repo.db.units.length, 0);
});
test("seed refuses unknown institution types and invalid templates", async () => {
  const core = createCatalogueCore({ repo: makeRepo() });
  await assert.rejects(() => core.seed({ institutions: [{ name: "X", institutionType: "castle" }], templates: [], curricula: {} }), /Unknown institution type/);
  await assert.rejects(() => core.seed({ institutions: INSTS, templates: [{ code: "", title: "T", level: "diploma", appliesTo: { types: ["medical_training"] } }], curricula: {} }), /Template/);
});

// ── admin import / verify ──
async function world() {
  const repo = makeRepo(); const core = createCatalogueCore({ repo });
  const inst = await repo.createInstitution({ name: "Kenya Medical Training College", institutionType: "medical_training" });
  repo.db.users.set("9".padStart(24, "0"), { _id: "9".padStart(24, "0"), role: "superadmin" });
  repo.db.users.set("8".padStart(24, "0"), { _id: "8".padStart(24, "0"), role: "admin" });
  return { repo, core, inst, SUPER: "9".padStart(24, "0"), ADMIN: "8".padStart(24, "0") };
}
const payload = (inst, extra = {}) => ({ institutionId: inst._id, courses: [{ code: "DIP-NURS", title: "Diploma in Nursing", level: "diploma", durationYears: 3, units: [
  { code: "n111", name: "Anatomy", yearOfStudy: 1, semester: 1, credits: 4 }, { code: "N121", name: "Pharmacology", yearOfStudy: 1, semester: 2 }] }], ...extra });

test("import: only a superadmin may import", async () => {
  const { core, inst, ADMIN } = await world();
  assert.equal((await core.importCourses(ADMIN, payload(inst))).status, 403);
  assert.equal((await core.importCourses("7".padStart(24, "0"), payload(inst))).status, 403);
});
test("import creates a course and units, needing verification by default", async () => {
  const { repo, core, inst, SUPER } = await world();
  const r = await core.importCourses(SUPER, payload(inst));
  assert.deepEqual(r.data, { courses: { created: 1, updated: 0 }, units: { created: 2, updated: 0 } });
  assert.equal(repo.db.courses[0].verificationStatus, "needs_verification");
  assert.equal(repo.db.units[0].code, "N111");
});
test("re-importing updates in place and never duplicates", async () => {
  const { repo, core, inst, SUPER } = await world();
  await core.importCourses(SUPER, payload(inst));
  const p = payload(inst); p.courses[0].units[0].name = "Anatomy and Physiology";
  const r = await core.importCourses(SUPER, p);
  assert.deepEqual(r.data, { courses: { created: 0, updated: 1 }, units: { created: 0, updated: 2 } });
  assert.equal(repo.db.courses.length, 1);
  assert.equal(repo.db.units.length, 2);
  assert.equal(repo.db.units.find((u) => u.code === "N111").name, "Anatomy and Physiology");
});
test("import matches an existing course by title when the code differs", async () => {
  const { repo, core, inst, SUPER } = await world();
  await repo.createCourse({ universityId: inst._id, code: "OLD", title: "Diploma in Nursing" });
  const r = await core.importCourses(SUPER, payload(inst));
  assert.equal(r.data.courses.updated, 1);
  assert.equal(repo.db.courses.length, 1);
});
test("import with verified:true marks course and units verified", async () => {
  const { repo, core, inst, SUPER } = await world();
  await core.importCourses(SUPER, payload(inst, { verified: true }));
  assert.equal(repo.db.courses[0].verificationStatus, "verified");
  assert.ok(repo.db.units.every((u) => u.verificationStatus === "verified"));
});
test("import validates everything before writing anything", async () => {
  const { repo, core, inst, SUPER } = await world();
  const bad = payload(inst); bad.courses.push({ code: "X", title: "Bad", level: "nonsense" });
  const r = await core.importCourses(SUPER, bad);
  assert.equal(r.status, 400);
  assert.equal(repo.db.courses.length, 0); assert.equal(repo.db.units.length, 0);
  const dupUnit = payload(inst); dupUnit.courses[0].units.push({ code: "N111", name: "Dup", yearOfStudy: 1, semester: 1 });
  assert.equal((await core.importCourses(SUPER, dupUnit)).status, 400);
  const badYear = payload(inst); badYear.courses[0].units[0].yearOfStudy = 4;
  assert.equal((await core.importCourses(SUPER, badYear)).status, 400, "year beyond the course duration");
  const dupCourse = payload(inst); dupCourse.courses.push({ ...dupCourse.courses[0] });
  assert.equal((await core.importCourses(SUPER, dupCourse)).status, 400);
  assert.equal(repo.db.courses.length, 0);
});
test("import rejects a bad institution and bad shapes", async () => {
  const { core, inst, SUPER } = await world();
  assert.equal((await core.importCourses(SUPER, { institutionId: "nope", courses: [] })).status, 400);
  assert.equal((await core.importCourses(SUPER, { institutionId: "5".padStart(24, "0"), courses: [{}] })).status, 404);
  assert.equal((await core.importCourses(SUPER, { institutionId: inst._id, courses: [] })).status, 400);
  assert.equal((await core.importCourses(SUPER, { institutionId: inst._id })).status, 400);
});
test("verify flips a course and all its units, superadmin only", async () => {
  const { repo, core, inst, SUPER, ADMIN } = await world();
  await core.importCourses(SUPER, payload(inst));
  const cid = repo.db.courses[0]._id;
  assert.equal((await core.verifyCourse(ADMIN, cid, true)).status, 403);
  assert.equal((await core.verifyCourse(SUPER, "bad", true)).status, 400);
  assert.equal((await core.verifyCourse(SUPER, cid, "yes")).status, 400);
  assert.equal((await core.verifyCourse(SUPER, "6".padStart(24, "0"), true)).status, 404);
  const r = await core.verifyCourse(SUPER, cid, true);
  assert.equal(r.data.unitsUpdated, 2);
  assert.equal(repo.db.courses[0].verificationStatus, "verified");
  await core.verifyCourse(SUPER, cid, false);
  assert.ok(repo.db.units.every((u) => u.verificationStatus === "needs_verification"));
});

// ── reads ──
async function readWorld() {
  const w = await world();
  const { repo, core, inst, SUPER } = w;
  const other = await repo.createInstitution({ name: "Strathmore University", institutionType: "university_private" });
  await core.importCourses(SUPER, payload(inst));
  const course = repo.db.courses[0];
  const S = "1".padStart(24, "0"), T = "2".padStart(24, "0"), L = "3".padStart(24, "0");
  repo.db.users.set(S, { _id: S, role: "student", universityId: inst._id, courseId: course._id, programme: "Diploma in Nursing", yearOfStudy: 1, semester: 2 });
  repo.db.users.set(T, { _id: T, role: "student", universityId: other._id, courseId: null, programme: "", yearOfStudy: 1, semester: 1 });
  repo.db.users.set(L, { _id: L, role: "lecturer", universityId: inst._id });
  return { ...w, other, course, S, T, L };
}
test("institutions: filter by type and name, bad type is 400", async () => {
  const { core, S } = await readWorld();
  assert.equal((await core.listInstitutions(S, { type: "medical_training" })).count, 1);
  assert.equal((await core.listInstitutions(S, { q: "strath" })).data[0].name, "Strathmore University");
  assert.equal((await core.listInstitutions(S, { type: "castle" })).status, 400);
  assert.equal((await core.listInstitutions("4".padStart(24, "0"), {})).status, 401);
  assert.equal((await core.listInstitutions(S, { type: "university_private" })).data[0].typeLabel, "Private university");
});
test("institution courses: a student sees only their own institution, with level and unit counts", async () => {
  const { core, inst, other, S, SUPER } = await readWorld();
  const r = await core.listInstitutionCourses(S, inst._id, {});
  assert.equal(r.count, 1);
  assert.equal(r.data[0].levelLabel, "Diploma");
  assert.equal(r.data[0].unitCount, 2);
  assert.equal(r.data[0].verificationStatus, "needs_verification");
  assert.equal((await core.listInstitutionCourses(S, other._id, {})).status, 404);
  assert.equal((await core.listInstitutionCourses(SUPER, other._id, {})).ok, true);
  assert.equal((await core.listInstitutionCourses(S, inst._id, { level: "degree" })).count, 0);
  assert.equal((await core.listInstitutionCourses(S, inst._id, { level: "bogus" })).status, 400);
  assert.equal((await core.listInstitutionCourses(S, "bad", {})).status, 400);
});
test("course units: own institution and staff only, grouped, current marked for the student's own course", async () => {
  const { core, course, S, T, L, SUPER } = await readWorld();
  const mine = await core.courseUnits(S, course._id);
  assert.equal(mine.data.totalUnits, 2);
  assert.deepEqual(mine.data.groups.map((g) => [g.label, g.isCurrent]), [["Year 1 · Semester 1", false], ["Year 1 · Semester 2", true]]);
  assert.equal(mine.data.unitsNeedVerification, true);
  assert.equal((await core.courseUnits(T, course._id)).status, 404, "other institution");
  assert.equal((await core.courseUnits(L, course._id)).ok, true);
  assert.equal((await core.courseUnits(SUPER, course._id)).ok, true);
  assert.equal((await core.courseUnits(S, "bad")).status, 400);
  assert.equal((await core.courseUnits(S, "7".padStart(24, "0"))).status, 404);
});
test("my units: the saved course, grouped by year and semester, respecting saved year and semester", async () => {
  const { core, S, course } = await readWorld();
  const r = await core.myUnits(S);
  assert.equal(r.data.hasCourse, true);
  assert.equal(r.data.course._id, course._id);
  assert.equal(r.data.yearOfStudy, 1);
  assert.equal(r.data.semester, 2);
  assert.equal(r.data.groups.find((g) => g.isCurrent).units[0].code, "N121");
});
test("my units: no course selected gives the setup message state, not an error", async () => {
  const { core, T } = await readWorld();
  const r = await core.myUnits(T);
  assert.deepEqual(r.data, { hasCourse: false, reason: "no_course", yearOfStudy: 1, semester: 1, groups: [], totalUnits: 0 });
});
test("my units: a saved course from another institution is ignored (institution mismatch)", async () => {
  const { core, repo, course, T } = await readWorld();
  repo.db.users.get(T).courseId = course._id; // T is at Strathmore, the course is at KMTC
  assert.equal((await core.myUnits(T)).data.hasCourse, false);
});
test("my units: older accounts with exactly one enrolled course are healed without re-selecting", async () => {
  const { core, repo, course, S } = await readWorld();
  repo.db.users.get(S).courseId = null;
  repo.db.courses.find((c) => c._id === course._id).enrolledStudentIds.push(S);
  const r = await core.myUnits(S);
  assert.equal(r.data.hasCourse, true);
  assert.equal(repo.db.users.get(S).courseId, course._id, "saved for next time");
});
test("my units: several enrolled courses are matched by programme, never guessed", async () => {
  const { core, repo, inst, course, S } = await readWorld();
  const second = await repo.createCourse({ universityId: inst._id, code: "DIP-CM", title: "Diploma in Clinical Medicine" });
  repo.db.users.get(S).courseId = null;
  for (const c of repo.db.courses) c.enrolledStudentIds.push(S);
  assert.equal((await core.myUnits(S)).data.course._id, course._id, "programme matches the nursing course");
  repo.db.users.get(S).courseId = null;
  repo.db.users.get(S).programme = "Something else";
  const r = await core.myUnits(S);
  assert.equal(r.data.hasCourse, false, "ambiguous: no guess");
  assert.equal(repo.db.users.get(S).courseId, null);
  assert.ok(second);
});
test("my units: students only; unknown accounts are 401", async () => {
  const { core, L } = await readWorld();
  assert.equal((await core.myUnits(L)).status, 403);
  assert.equal((await core.myUnits("4".padStart(24, "0"))).status, 401);
});

// ── records written by an earlier session (legacy spellings) ──
test("seed still applies the right templates to an institution an earlier session typed with a legacy spelling", async () => {
  const repo = makeRepo(); const core = createCatalogueCore({ repo });
  const inst = await repo.createInstitution({ name: "Kenya Medical Training College", institutionType: "medical_training_college" });
  await run(core);
  assert.ok(repo.db.courses.some((c) => c.universityId === inst._id && c.code === "DIP-NURS"), "nursing diploma applied");
  assert.equal(repo.db.institutions.find((i) => i._id === inst._id).institutionType, "medical_training_college", "legacy value left alone");
});
test("older course records read correctly: qualificationLevel and the longer verification vocabulary", async () => {
  const { repo, core, inst, S } = await (async () => {
    const w = await readWorld();
    return w;
  })();
  const legacy = await repo.createCourse({ universityId: inst._id, code: "OLD-1", title: "Old Diploma", qualificationLevel: "diploma", verificationStatus: "needs_official_verification" });
  const r = await core.courseUnits(S, legacy._id);
  assert.equal(r.data.course.level, "diploma");
  assert.equal(r.data.course.levelLabel, "Diploma");
  assert.equal(r.data.course.verificationStatus, "needs_verification");
});
test("institution list accepts a legacy type name and reports canonical types", async () => {
  const { core, repo, S } = await readWorld();
  await repo.createInstitution({ name: "Some Technical Institute", institutionType: "technical_institute" });
  repo.searchInstitutions = async ({ institutionType }) => repo.db.institutions.filter((i) => !institutionType || ["tvet_college", "technical_institute"].includes(i.institutionType));
  const r = await core.listInstitutions(S, { type: "technical_institute" });
  assert.equal(r.ok, true);
  assert.equal(r.data[0].institutionType, "tvet_college");
});
