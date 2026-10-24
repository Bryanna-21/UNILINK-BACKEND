"use strict";

// Catalogue decisions: seeding, admin import, verification, and the read paths behind My Units.
// No mongoose here: every database call goes through `repo` (catalogue.repo.js), so all of this runs
// under `npm test` against an in-memory repo.

const rules = require("../utils/catalogue.rules");
const curriculum = require("../utils/curriculum.rules");

const ok = (extra = {}) => ({ ok: true, ...extra });
const fail = (status, message) => ({ ok: false, status, message });

const MAX_IMPORT_COURSES = 100;
const MAX_UNITS_PER_COURSE = 200;

function createCatalogueCore({ repo }) {
  const viewerOrNull = async (id) => {
    const me = await repo.userById(id);
    return me && !me.deletedAt ? me : null;
  };

  // ── Seeding (idempotent, additive, never overwrites) ──────────────────────
  // institutions: [{ name, institutionType }]
  // templates:    [{ code, title, level, durationYears, semestersPerYear, appliesTo, curriculum }]
  // curricula:    { key: [{ code, name, credits, yearOfStudy, semester }] }
  async function seed({ institutions, templates, curricula, dryRun = false }) {
    const stats = {
      dryRun,
      institutions: { created: 0, matched: 0, typed: 0 },
      courses: { created: 0, matched: 0, filled: 0 },
      units: { created: 0, coursesAlreadyHadUnits: 0 },
    };

    const existingInstitutions = await repo.listInstitutions();
    const byName = new Map(existingInstitutions.map((i) => [rules.titleKey(i.name), i]));

    for (const input of institutions) {
      const type = rules.parseInstitutionType(input.institutionType);
      if (!type) throw new Error(`Unknown institution type for ${input.name}: ${input.institutionType}`);

      let inst = byName.get(rules.titleKey(input.name));
      if (inst) {
        stats.institutions.matched += 1;
        if (!inst.institutionType) {
          stats.institutions.typed += 1;
          if (!dryRun) await repo.fillInstitutionType(inst._id, type);
          inst = { ...inst, institutionType: type };
        }
      } else {
        stats.institutions.created += 1;
        inst = dryRun
          ? { _id: `dry-${rules.titleKey(input.name)}`, name: input.name, institutionType: type }
          : await repo.createInstitution({ name: input.name, institutionType: type });
        byName.set(rules.titleKey(input.name), inst);
      }

      // An institution an older session typed with a legacy spelling still gets the right templates.
      const institution = { name: input.name, institutionType: rules.parseInstitutionType(inst.institutionType) || type };
      const applicable = templates.filter((t) => rules.templateApplies(t, institution));
      if (!applicable.length) continue;

      const dry = dryRun && String(inst._id).startsWith("dry-");
      const existingCourses = dry ? [] : await repo.listCourses(String(inst._id));
      const byCode = new Map(existingCourses.map((c) => [rules.normalizeCode(c.code), c]));
      const byTitle = new Map(existingCourses.map((c) => [rules.titleKey(c.title), c]));

      for (const t of applicable) {
        const check = rules.validateCourseInput(t);
        if (!check.ok) throw new Error(`Template ${t.code}: ${check.message}`);
        const wanted = check.value;

        let course = byCode.get(wanted.code) || byTitle.get(rules.titleKey(wanted.title));
        if (course) {
          stats.courses.matched += 1;
          const missing = {};
          if (!course.level) missing.level = wanted.level; // an older `qualificationLevel` is left as it is
          if (!course.durationYears) missing.durationYears = wanted.durationYears;
          if (!course.semestersPerYear) missing.semestersPerYear = wanted.semestersPerYear;
          if (!course.verificationStatus) missing.verificationStatus = "needs_verification";
          if (Object.keys(missing).length) {
            stats.courses.filled += 1;
            if (!dryRun) await repo.fillCourse(course._id, missing);
            course = { ...course, ...missing };
          }
        } else {
          stats.courses.created += 1;
          course = dryRun
            ? { _id: `dry-${wanted.code}`, ...wanted }
            : await repo.createCourse({ ...wanted, universityId: String(inst._id) });
          byCode.set(wanted.code, course);
          byTitle.set(rules.titleKey(wanted.title), course);
        }

        // Units are only seeded into a course that has none yet, so a seeded structure never mixes with
        // one that someone already entered or verified.
        const units = t.curriculum ? curricula[t.curriculum] : null;
        if (!units) continue;
        const isDry = dryRun || String(course._id).startsWith("dry-");
        if (!isDry) {
          const have = await repo.unitCodesOfCourse(String(course._id));
          if (have.length) { stats.units.coursesAlreadyHadUnits += 1; continue; }
        }
        const prepared = units.map((u) => {
          const v = rules.validateUnitInput(u, { durationYears: wanted.durationYears || rules.LIMITS.maxYear, semestersPerYear: wanted.semestersPerYear });
          if (!v.ok) throw new Error(`Curriculum ${t.curriculum}: ${v.message}`);
          return v.value;
        });
        stats.units.created += prepared.length;
        if (!isDry) await repo.insertUnits(String(course._id), String(inst._id), prepared, "catalogue-seed");
      }
    }
    return stats;
  }

  // ── Admin import / verification (superadmin only) ────────────────────────
  async function importCourses(actorId, payload) {
    const actor = await viewerOrNull(actorId);
    if (!actor || actor.role !== "superadmin") return fail(403, "Only a superadmin can import catalogue data.");
    if (!payload || !rules.isObjectId(payload.institutionId)) return fail(400, "A valid institutionId is required.");
    const institution = await repo.institutionById(payload.institutionId);
    if (!institution) return fail(404, "Institution not found");
    const list = payload.courses;
    if (!Array.isArray(list) || !list.length || list.length > MAX_IMPORT_COURSES) {
      return fail(400, `Send between 1 and ${MAX_IMPORT_COURSES} courses.`);
    }
    const markVerified = payload.verified === true;

    // Validate everything first so a bad row never leaves a half-applied import.
    const prepared = [];
    const seenCodes = new Set();
    for (const raw of list) {
      const c = rules.validateCourseInput(raw);
      if (!c.ok) return fail(400, c.message);
      if (seenCodes.has(c.value.code)) return fail(400, `Course code ${c.value.code} appears twice in this import.`);
      seenCodes.add(c.value.code);
      const rawUnits = raw.units === undefined ? [] : raw.units;
      if (!Array.isArray(rawUnits) || rawUnits.length > MAX_UNITS_PER_COURSE) {
        return fail(400, `Course ${c.value.code}: units must be a list of at most ${MAX_UNITS_PER_COURSE}.`);
      }
      const units = [];
      const unitCodes = new Set();
      for (const ru of rawUnits) {
        const u = rules.validateUnitInput(ru, { durationYears: c.value.durationYears || rules.LIMITS.maxYear, semestersPerYear: c.value.semestersPerYear });
        if (!u.ok) return fail(400, `Course ${c.value.code}: ${u.message}`);
        if (unitCodes.has(u.value.code)) return fail(400, `Course ${c.value.code}: unit code ${u.value.code} appears twice.`);
        unitCodes.add(u.value.code);
        units.push(u.value);
      }
      prepared.push({ course: c.value, units });
    }

    const instId = String(institution._id);
    const existing = await repo.listCourses(instId);
    const byCode = new Map(existing.map((c) => [rules.normalizeCode(c.code), c]));
    const byTitle = new Map(existing.map((c) => [rules.titleKey(c.title), c]));
    const out = { courses: { created: 0, updated: 0 }, units: { created: 0, updated: 0 } };
    const status = markVerified ? "verified" : "needs_verification";

    for (const { course: wanted, units } of prepared) {
      let doc = byCode.get(wanted.code) || byTitle.get(rules.titleKey(wanted.title));
      if (doc) {
        out.courses.updated += 1;
        const set = { level: wanted.level, semestersPerYear: wanted.semestersPerYear };
        if (wanted.durationYears) set.durationYears = wanted.durationYears;
        if (wanted.description) set.description = wanted.description;
        if (markVerified) set.verificationStatus = "verified";
        else if (!doc.verificationStatus) set.verificationStatus = "needs_verification";
        await repo.updateCourse(doc._id, set);
      } else {
        out.courses.created += 1;
        doc = await repo.createCourse({ ...wanted, universityId: instId, verificationStatus: status, catalogueSource: "admin-import" });
        byCode.set(wanted.code, doc);
      }
      if (units.length) {
        const r = await repo.upsertUnits(String(doc._id), instId, units, status, "admin-import");
        out.units.created += r.created;
        out.units.updated += r.updated;
      }
    }
    return ok({ data: out });
  }

  async function verifyCourse(actorId, courseId, verified) {
    const actor = await viewerOrNull(actorId);
    if (!actor || actor.role !== "superadmin") return fail(403, "Only a superadmin can verify catalogue data.");
    if (!rules.isObjectId(courseId)) return fail(400, "Invalid course id");
    if (typeof verified !== "boolean") return fail(400, "verified must be true or false.");
    const course = await repo.courseById(courseId);
    if (!course) return fail(404, "Course not found");
    const status = verified ? "verified" : "needs_verification";
    await repo.updateCourse(course._id, { verificationStatus: status });
    const units = await repo.setUnitsVerification(String(course._id), status);
    return ok({ data: { courseId: String(course._id), verificationStatus: status, unitsUpdated: units } });
  }

  // ── Read paths ─────────────────────────────────────────────────────────────
  async function listInstitutions(viewerId, { type, q, limit } = {}) {
    const me = await viewerOrNull(viewerId);
    if (!me) return fail(401, "Account not available.");
    let institutionType = null;
    if (type) {
      institutionType = rules.parseInstitutionType(type);
      if (!institutionType) return fail(400, `type must be one of: ${rules.INSTITUTION_TYPES.join(", ")}.`);
    }
    const rows = await repo.searchInstitutions({
      institutionType,
      q: rules.normalizeText(String(q || "").slice(0, 100)),
      limit: Math.min(Math.max(Number(limit) || 100, 1), 200),
    });
    return ok({
      count: rows.length,
      data: rows.map((i) => ({
        _id: String(i._id), name: i.name, institutionType: rules.parseInstitutionType(i.institutionType) || i.institutionType || null,
        typeLabel: rules.INSTITUTION_TYPE_LABELS[rules.parseInstitutionType(i.institutionType)] || null, verified: !!i.verified,
      })),
    });
  }

  // Older records may carry the level as `qualificationLevel` and a longer verification vocabulary; both are read here.
  const courseSummary = (c) => {
    const level = c.level || c.qualificationLevel || null;
    return {
      _id: String(c._id), code: c.code || null, title: c.title, level,
      levelLabel: rules.LEVEL_LABELS[level] || null, durationYears: c.durationYears || null,
      semestersPerYear: c.semestersPerYear || null,
      verificationStatus: rules.normalizeVerification(c.verificationStatus),
    };
  };

  async function listInstitutionCourses(viewerId, institutionId, { level, q } = {}) {
    if (!rules.isObjectId(institutionId)) return fail(400, "Invalid institution id");
    const me = await viewerOrNull(viewerId);
    if (!me) return fail(401, "Account not available.");
    const staff = me.role === "admin" || me.role === "superadmin";
    if (!staff && String(me.universityId) !== String(institutionId)) return fail(404, "Institution not found");
    let wantLevel = null;
    if (level) {
      wantLevel = rules.parseLevel(level);
      if (!wantLevel) return fail(400, `level must be one of: ${rules.LEVELS.join(", ")}.`);
    }
    const courses = await repo.searchCourses({ universityId: String(institutionId), level: wantLevel, q: rules.cleanLine(q).slice(0, 100), limit: 300 });
    const counts = await repo.unitCounts(courses.map((c) => String(c._id)));
    return ok({
      count: courses.length,
      data: courses.map((c) => ({ ...courseSummary(c), unitCount: counts[String(c._id)] || 0 })),
    });
  }

  async function courseUnits(viewerId, courseId) {
    if (!rules.isObjectId(courseId)) return fail(400, "Invalid course id");
    const me = await viewerOrNull(viewerId);
    if (!me) return fail(401, "Account not available.");
    const course = await repo.courseById(courseId);
    if (!course || !rules.canSeeCatalogueCourse({ viewer: me, course })) return fail(404, "Course not found");
    const units = await repo.unitsOfCourse(String(course._id));
    const isOwnCourse = me.role === "student" && String(me.courseId || "") === String(course._id);
    const groups = curriculum.groupUnits(units, isOwnCourse ? { year: me.yearOfStudy, semester: me.semester } : {});
    return ok({
      data: {
        course: courseSummary(course), groups, totalUnits: units.length,
        unitsNeedVerification: units.some((u) => u.verificationStatus !== "verified"),
      },
    });
  }

  // The student's own units. Uses the saved course; for older accounts that enrolled before courseId was stored it
  // falls back to the one enrolled course (matching their programme if there are several) and saves it, so nobody has
  // to pick their course again. It never guesses between several equally likely courses.
  async function myUnits(viewerId) {
    const me = await viewerOrNull(viewerId);
    if (!me) return fail(401, "Account not available.");
    if (me.role !== "student") return fail(403, "Only students have a My Units list.");

    let course = null;
    if (me.courseId && rules.isObjectId(me.courseId)) {
      const saved = await repo.courseById(String(me.courseId));
      if (saved && String(saved.universityId) === String(me.universityId)) course = saved;
    }
    if (!course && me.universityId) {
      const enrolled = await repo.enrolledCourses(String(me._id), String(me.universityId));
      let pick = null;
      if (enrolled.length === 1) pick = enrolled[0];
      else if (enrolled.length > 1 && me.programme) {
        const same = enrolled.filter((c) => rules.titleKey(c.title) === rules.titleKey(me.programme));
        if (same.length === 1) pick = same[0];
      }
      if (pick) {
        course = pick;
        await repo.setCourseIfEmpty(String(me._id), String(pick._id));
      }
    }

    if (!course) {
      return ok({ data: { hasCourse: false, reason: "no_course", yearOfStudy: me.yearOfStudy ?? null, semester: me.semester ?? null, groups: [], totalUnits: 0 } });
    }
    const units = await repo.unitsOfCourse(String(course._id));
    const groups = curriculum.groupUnits(units, { year: me.yearOfStudy, semester: me.semester });
    return ok({
      data: {
        hasCourse: true, course: courseSummary(course), yearOfStudy: me.yearOfStudy ?? null, semester: me.semester ?? null,
        groups, totalUnits: units.length,
        unitsNeedVerification: units.some((u) => u.verificationStatus !== "verified"),
      },
    });
  }

  return { seed, importCourses, verifyCourse, listInstitutions, listInstitutionCourses, courseUnits, myUnits };
}

module.exports = { createCatalogueCore, MAX_IMPORT_COURSES, MAX_UNITS_PER_COURSE };
