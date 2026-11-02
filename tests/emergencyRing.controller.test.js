"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createEmergencyRing, ACTIVE_WINDOW_MS } = require("../src/controllers/emergencyRing.controller");
const { numbersFor } = require("../src/utils/emergencyNumbers");

const hex = (n) => String(n).padStart(24, "0");
const UNI_A = hex(101), UNI_B = hex(102);
const NOW = Date.parse("2026-10-31T12:00:00Z");

const chain = (v) => {
  const o = { select: () => o, sort: () => o, limit: () => o, lean: () => o, then: (res, rej) => Promise.resolve(v).then(res, rej) };
  return o;
};
const res = () => {
  const out = { status: 200, body: null };
  return { out, status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; } };
};
const noOverrides = (country) => numbersFor(country, { overrides: {} });

function build({ users = {}, universities = {}, reports = [], failUser = false } = {}) {
  const seen = { reportFilter: null };
  const ring = createEmergencyRing({
    User: {
      findById: (id) => { if (failUser) throw new Error("db"); return chain(users[id] || null); },
      find: (q) => chain(Object.values(users).filter((u) => (q._id.$in || []).includes(String(u._id)))),
    },
    University: { findById: (id) => chain(universities[id] || null) },
    EmergencyReport: { find: (f) => { seen.reportFilter = f; return chain(reports); } },
    numbersFor: noOverrides,
    isValidId: (v) => /^[0-9a-f]{24}$/i.test(String(v)),
    now: () => NOW,
  });
  return { ring, seen };
}

test("contacts: a Kenyan university gives the Kenyan numbers", async () => {
  const { ring } = build({ users: { u1: { universityId: UNI_A } }, universities: { [UNI_A]: { country: "Kenya" } } });
  const r = res();
  await ring.getContacts({ user: { id: "u1" } }, r);
  assert.equal(r.out.status, 200);
  assert.equal(r.out.body.country, "KE");
  assert.deepEqual(r.out.body.data.map((n) => n.phone), ["999", "112"]);
});

test("contacts: an unlisted country gets 112 and known:false", async () => {
  const { ring } = build({ users: { u1: { universityId: UNI_B } }, universities: { [UNI_B]: { country: "Atlantis" } } });
  const r = res();
  await ring.getContacts({ user: { id: "u1" } }, r);
  assert.equal(r.out.body.known, false);
  assert.deepEqual(r.out.body.data.map((n) => n.phone), ["112"]);
});

test("contacts: no university, or a lookup failure, still returns numbers", async () => {
  for (const opts of [{ users: { u1: {} } }, { users: {}, failUser: true }]) {
    const { ring } = build(opts);
    const r = res();
    const quiet = console.error; console.error = () => {};
    try { await ring.getContacts({ user: { id: "u1" } }, r); } finally { console.error = quiet; }
    assert.equal(r.out.status, 200);
    assert.ok(r.out.body.data.length > 0);
  }
});

const REPORT = (over = {}) => ({ _id: hex(900), userId: "stu", type: "sos", status: "OPEN", location: "Library", coordinates: { latitude: null, longitude: null }, createdAt: new Date(NOW - 60000), ...over });

test("active alerts: students and lecturers are refused", async () => {
  for (const role of ["student", "lecturer"]) {
    const { ring } = build({ users: { me: { role, status: "active" } } });
    const r = res();
    await ring.getActiveAlerts({ user: { id: "me" } }, r);
    assert.equal(r.out.status, 403);
  }
});

test("active alerts: a suspended admin is refused", async () => {
  const { ring } = build({ users: { me: { role: "admin", status: "suspended" } } });
  const r = res();
  await ring.getActiveAlerts({ user: { id: "me" } }, r);
  assert.equal(r.out.status, 403);
});

test("active alerts: an admin of university A is limited to university A, and only recent OPEN SOS", async () => {
  const { ring, seen } = build({
    users: { me: { role: "admin", universityId: UNI_A, status: "active" }, stu: { _id: "stu", name: "Amina", phone: "0712345678" } },
    reports: [REPORT()],
  });
  const r = res();
  await ring.getActiveAlerts({ user: { id: "me" } }, r);
  assert.equal(r.out.status, 200);
  assert.equal(seen.reportFilter.universityId, UNI_A);
  assert.equal(seen.reportFilter.type, "sos");
  assert.equal(seen.reportFilter.status, "OPEN");
  assert.equal(seen.reportFilter.createdAt.$gte.getTime(), NOW - ACTIVE_WINDOW_MS);
  assert.equal(r.out.body.data[0].studentName, "Amina");
  assert.equal(r.out.body.data[0].studentPhone, "0712345678");
  assert.ok(r.out.body.numbers.length > 0);
});

test("active alerts: a superadmin and a platform admin are not limited by university", async () => {
  for (const me of [{ role: "superadmin", status: "active" }, { role: "admin", universityId: null, status: "active" }]) {
    const { ring, seen } = build({ users: { me }, reports: [] });
    const r = res();
    await ring.getActiveAlerts({ user: { id: "me" } }, r);
    assert.equal(r.out.status, 200);
    assert.equal("universityId" in seen.reportFilter, false);
  }
});

test("active alerts: a reporter who no longer exists is shown as 'A student', not a crash", async () => {
  const { ring } = build({ users: { me: { role: "superadmin", status: "active" } }, reports: [REPORT({ userId: "gone" })] });
  const r = res();
  await ring.getActiveAlerts({ user: { id: "me" } }, r);
  assert.equal(r.out.body.data[0].studentName, "A student");
});
