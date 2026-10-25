"use strict";

// Pure planning rules for tidying the institution list. No database in here (scripts/consolidateCatalogue.js reads
// the data, asks these functions what to do, and only writes when explicitly told to).
//
// Two problems this addresses, both found in the live data:
//  1. Kenya Medical Training College was stored as ~100 separate "institutions" ("Kenya Medical Training College -
//     Nairobi Campus", ...). Courses attach to ONE institution record, so a student who picked a campus record would see
//     no courses. The right shape is one KMTC institution with campuses under it (the Campus model already exists).
//  2. Teacher training colleges are untyped, and a few exist twice under slightly different names.
//
// Nothing here ever deletes. Campus-records are deactivated (status "inactive"), which hides them from the
// registration list and can be reversed by setting the status back.

const { titleKey } = require("./catalogue.rules");

const CANONICAL_KMTC = "Kenya Medical Training College";

// "Kenya Medical Training College - Nairobi Campus" -> "Nairobi Campus"; anything else -> null.
function parseKmtcCampusName(name) {
  const m = /^\s*kenya medical training college\s*[-–—]\s*(\S.*?)\s*$/i.exec(String(name || ""));
  return m ? m[1] : null;
}

// institutions: [{ _id, name, status }]. The counts are keyed by institution id.
function planKmtcConsolidation({ institutions, studentsByUni = {}, coursesByUni = {}, enrolmentsByUni = {} }) {
  const canonical = institutions.find((i) => titleKey(i.name) === titleKey(CANONICAL_KMTC));
  if (!canonical) return { ok: false, reason: `"${CANONICAL_KMTC}" does not exist yet. Run the catalogue seed first.` };

  const campuses = [];
  const seen = new Map();
  for (const i of institutions) {
    if (String(i._id) === String(canonical._id)) continue;
    const campusName = parseKmtcCampusName(i.name);
    if (!campusName) continue;
    const id = String(i._id);
    const blockers = [];
    if ((studentsByUni[id] || 0) > 0) blockers.push(`${studentsByUni[id]} student(s) are registered at this record`);
    if ((enrolmentsByUni[id] || 0) > 0) blockers.push(`${enrolmentsByUni[id]} course enrolment(s) exist under this record`);
    let action = blockers.length ? "blocked" : "consolidate";
    if (i.status === "inactive") action = "already-inactive";
    // Two records can carry the same campus name; the campus is created once and both records are retired.
    const key = titleKey(campusName);
    const duplicateOf = seen.get(key) || null;
    if (!seen.has(key)) seen.set(key, campusName);
    campuses.push({ recordId: id, recordName: i.name, campusName, action, blockers, coursesOnRecord: coursesByUni[id] || 0, duplicateOfCampus: duplicateOf, ensureCampus: action !== "blocked" });
  }
  const count = (a) => campuses.filter((c) => c.action === a).length;
  return {
    ok: true,
    canonical: { id: String(canonical._id), name: canonical.name },
    campuses,
    counts: { total: campuses.length, consolidate: count("consolidate"), blocked: count("blocked"), alreadyInactive: count("already-inactive") },
  };
}

const isTeacherCollegeName = (name) => /teachers?\s+(training\s+)?college/i.test(String(name || ""));

const STOP = new Set(["teachers", "teacher", "training", "college", "tc", "ttc", "st", "saint", "diploma", "kenya", "the", "of", "and"]);
const significantTokens = (name) => titleKey(name).split(" ").filter((t) => t && !STOP.has(t));

// Pairs of teacher colleges where one name's significant words are all inside the other's ("Kigari" / "St Marks Kigari").
// Only a report: a person decides whether they are really the same college.
function possibleDuplicateTeacherColleges(institutions) {
  const colleges = institutions.filter((i) => isTeacherCollegeName(i.name)).map((i) => ({ i, t: significantTokens(i.name) })).filter((x) => x.t.length);
  const pairs = [];
  for (let a = 0; a < colleges.length; a++) {
    for (let b = a + 1; b < colleges.length; b++) {
      const small = colleges[a].t.length <= colleges[b].t.length ? colleges[a] : colleges[b];
      const big = small === colleges[a] ? colleges[b] : colleges[a];
      if (small.t.every((tok) => big.t.includes(tok))) pairs.push([colleges[a].i.name, colleges[b].i.name]);
    }
  }
  return pairs;
}

// Untyped records whose name says they are a teacher training college.
const teacherCollegesToType = (institutions) => institutions.filter((i) => !i.institutionType && isTeacherCollegeName(i.name));

module.exports = { CANONICAL_KMTC, parseKmtcCampusName, planKmtcConsolidation, isTeacherCollegeName, possibleDuplicateTeacherColleges, teacherCollegesToType };
