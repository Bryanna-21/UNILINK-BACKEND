"use strict";

// Turns a flat unit list into the "Year 1 · Semester 2" groups the Academics screen shows.
// The same unit code can appear in several courses at different places: each course has its own
// placement rows, so nothing here assumes a unit code is unique across courses.

const num = (v) => (Number.isFinite(Number(v)) ? Number(v) : null);

function groupUnits(units, { year = null, semester = null } = {}) {
  const wantYear = num(year);
  const wantSem = num(semester);
  const buckets = new Map();
  for (const u of units || []) {
    const y = num(u.yearOfStudy);
    const s = num(u.semester);
    if (y === null || s === null) continue;
    const key = `${y}-${s}`;
    if (!buckets.has(key)) buckets.set(key, { year: y, semester: s, units: [] });
    buckets.get(key).units.push({
      _id: u._id ? String(u._id) : undefined,
      code: u.code,
      name: u.name,
      description: u.description || "",
      credits: u.credits ?? null,
      verificationStatus: u.verificationStatus || "needs_verification",
    });
  }
  const groups = [...buckets.values()]
    .sort((a, b) => a.year - b.year || a.semester - b.semester)
    .map((g) => ({
      ...g,
      label: `Year ${g.year} · Semester ${g.semester}`,
      isCurrent: wantYear !== null && wantSem !== null && g.year === wantYear && g.semester === wantSem,
      units: g.units.sort((a, b) => String(a.code).localeCompare(String(b.code), "en", { numeric: true })),
    }));
  return groups;
}

module.exports = { groupUnits };
