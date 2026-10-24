"use strict";
// Runs the REAL updateMyProfile controller with only the database methods faked, to prove the
// university lock is actually wired into PUT /profile/me (not just present as a helper).
const test = require("node:test");
const assert = require("node:assert/strict");

const User = require("../src/models/User");
const University = require("../src/models/University");
const profileController = require("../src/controllers/profile.controller");

const hex = (n) => String(n).padStart(24, "0");
const UNI_A = hex(101), UNI_B = hex(102), UNI_GHOST = hex(999);
const ME = hex(1);

const chain = (v) => {
  const o = { select: () => o, lean: () => o, then: (res, rej) => Promise.resolve(v).then(res, rej) };
  return o;
};

function setup(me) {
  const saved = [];
  const patch = (obj, name, fn) => { saved.push([obj, name, obj[name]]); obj[name] = fn; };
  const writes = [];
  patch(User, "findById", () => chain(me ? { ...me } : null));
  patch(User, "findByIdAndUpdate", (id, op) => { writes.push(op.$set); return chain({ _id: ME, ...me, ...op.$set }); });
  patch(University, "exists", async (f) => (String(f._id) === UNI_A || String(f._id) === UNI_B ? { _id: f._id } : null));
  return { writes, restore: () => saved.reverse().forEach(([o, n, f]) => { o[n] = f; }) };
}

const call = async (body, role = "student") => {
  const out = { status: 200, body: null };
  const res = { status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; } };
  await profileController.updateMyProfile({ body, user: { id: ME, role, universityId: UNI_A } }, res);
  return out;
};

const midSetup = { role: "student", universityId: UNI_A, onboardingCompletedAt: null, programme: "", yearOfStudy: null, semester: null };
const finished = { ...midSetup, onboardingCompletedAt: new Date() };

test("a student who finished setup cannot move to another university", async () => {
  const s = setup(finished);
  try {
    const r = await call({ universityId: UNI_B });
    assert.equal(r.status, 403);
    assert.equal(s.writes.length, 0, "nothing may be written");
  } finally { s.restore(); }
});

test("a legacy student (programme, year, semester) is locked too", async () => {
  const s = setup({ ...midSetup, programme: "BSc", yearOfStudy: 2, semester: 1 });
  try {
    assert.equal((await call({ universityId: UNI_B })).status, 403);
    assert.equal(s.writes.length, 0);
  } finally { s.restore(); }
});

test("a student mid-setup can still switch university, and the stale campus is cleared", async () => {
  const s = setup(midSetup);
  try {
    const r = await call({ universityId: UNI_B });
    assert.equal(r.status, 200);
    assert.equal(s.writes.length, 1);
    assert.equal(s.writes[0].universityId, UNI_B);
    assert.equal(s.writes[0].campusId, null);
  } finally { s.restore(); }
});

test("the final setup save (same university + onboardingCompleted) still works", async () => {
  const s = setup(midSetup);
  try {
    const r = await call({ universityId: UNI_A, programme: "BSc CS", yearOfStudy: 2, semester: 1, onboardingCompleted: true });
    assert.equal(r.status, 200);
    assert.equal(s.writes[0].universityId, undefined, "unchanged university is not rewritten");
    assert.equal(s.writes[0].campusId, undefined, "campus untouched when university is unchanged");
    assert.ok(s.writes[0].onboardingCompletedAt instanceof Date);
  } finally { s.restore(); }
});

test("a locked student resending their own university does not get an error", async () => {
  const s = setup(finished);
  try {
    const r = await call({ universityId: UNI_A, bio: "hello" });
    assert.equal(r.status, 200);
    assert.equal(s.writes[0].universityId, undefined);
    assert.equal(s.writes[0].bio, "hello");
  } finally { s.restore(); }
});

test("admins, lecturers and superadmins cannot reassign themselves", async () => {
  for (const role of ["admin", "lecturer", "superadmin"]) {
    const s = setup({ ...midSetup, role });
    try {
      assert.equal((await call({ universityId: UNI_B }, role)).status, 403, role);
      assert.equal(s.writes.length, 0, role);
    } finally { s.restore(); }
  }
});

test("a university that does not exist is refused", async () => {
  const s = setup(midSetup);
  try {
    const r = await call({ universityId: UNI_GHOST });
    assert.equal(r.status, 400);
    assert.equal(s.writes.length, 0);
  } finally { s.restore(); }
});

test("clearing the university is refused", async () => {
  for (const v of ["", null]) {
    const s = setup(midSetup);
    try {
      assert.equal((await call({ universityId: v })).status, 400);
      assert.equal(s.writes.length, 0);
    } finally { s.restore(); }
  }
});

test("garbage or injection-shaped values are refused before any write", async () => {
  for (const v of ["not-an-id", { $ne: "" }, 5, ["x"]]) {
    const s = setup(midSetup);
    try {
      assert.equal((await call({ universityId: v })).status, 400);
      assert.equal(s.writes.length, 0);
    } finally { s.restore(); }
  }
});

test("a request without universityId never touches the university", async () => {
  const s = setup(finished);
  try {
    const r = await call({ bio: "just a bio" });
    assert.equal(r.status, 200);
    assert.equal("universityId" in s.writes[0], false);
  } finally { s.restore(); }
});
