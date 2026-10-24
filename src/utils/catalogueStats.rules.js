"use strict";

// Pure summary of the catalogue's state, used by scripts/catalogueStats.js (read-only) so a seed can be checked
// without opening the database by hand. No database in here.

const rules = require("./catalogue.rules");

const bump = (obj, key) => { obj[key] = (obj[key] || 0) + 1; };

// institutions: [{ _id, name, institutionType }]
// courses:      [{ _id, universityId, code, title, level, qualificationLevel, verificationStatus }]
// unitsByCourse: { [courseId]: number of units }
// unitDuplicateGroups: how many (course, code) pairs appear more than once (should be 0; a unique index prevents it)
function summarise({ institutions = [], courses = [], unitsByCourse = {}, unitDuplicateGroups = 0 }) {
  const out = {
    institutions: { total: institutions.length, byType: {}, untyped: 0, legacyTyped: 0 },
    courses: { total: courses.length, byLevel: {}, withoutLevel: 0, verified: 0, needsVerification: 0, withUnits: 0, withoutUnits: 0, orphaned: 0, duplicateTitleGroups: [] },
    units: { total: 0, duplicateGroups: unitDuplicateGroups },
    problems: [],
  };

  const byId = new Map(institutions.map((i) => [String(i._id), i]));
  for (const i of institutions) {
    const canonical = rules.parseInstitutionType(i.institutionType);
    if (!i.institutionType) out.institutions.untyped += 1;
    else if (rules.INSTITUTION_TYPES.includes(i.institutionType)) bump(out.institutions.byType, i.institutionType);
    else if (canonical) { out.institutions.legacyTyped += 1; bump(out.institutions.byType, canonical); }
    else bump(out.institutions.byType, `unrecognised:${i.institutionType}`);
  }

  const titles = new Map();
  for (const c of courses) {
    const level = c.level || c.qualificationLevel || null;
    if (level) bump(out.courses.byLevel, level); else out.courses.withoutLevel += 1;
    if (c.verificationStatus === "verified") out.courses.verified += 1; else out.courses.needsVerification += 1;
    const n = unitsByCourse[String(c._id)] || 0;
    out.units.total += n;
    if (n > 0) out.courses.withUnits += 1; else out.courses.withoutUnits += 1;
    if (!c.universityId || !byId.has(String(c.universityId))) out.courses.orphaned += 1;
    const key = `${c.universityId}|${rules.titleKey(c.title)}`;
    titles.set(key, [...(titles.get(key) || []), c]);
  }
  for (const [key, list] of titles) {
    if (list.length > 1) {
      const inst = byId.get(key.split("|")[0]);
      out.courses.duplicateTitleGroups.push({ institution: inst ? inst.name : "(unknown)", title: list[0].title, count: list.length, codes: list.map((c) => c.code) });
    }
  }
  out.courses.duplicateTitleGroups = out.courses.duplicateTitleGroups.slice(0, 25);

  if (out.institutions.untyped) out.problems.push(`${out.institutions.untyped} institution(s) have no type.`);
  if (out.courses.orphaned) out.problems.push(`${out.courses.orphaned} course(s) point at an institution that does not exist.`);
  if (out.courses.duplicateTitleGroups.length) out.problems.push(`${out.courses.duplicateTitleGroups.length} institution(s) have courses with the same title under different codes.`);
  if (out.units.duplicateGroups) out.problems.push(`${out.units.duplicateGroups} duplicated unit code(s) inside a course.`);
  if (out.courses.withoutLevel) out.problems.push(`${out.courses.withoutLevel} course(s) have no qualification level.`);
  return out;
}

module.exports = { summarise };
