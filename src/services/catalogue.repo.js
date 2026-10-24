"use strict";

// The only file in the catalogue feature that touches mongoose. Deliberately thin: every decision lives in
// catalogue.core.js (unit-tested against an in-memory repo). Syntax-checked only until it has run against a real database.

const mongoose = require("mongoose");
const User = require("../models/User");
const University = require("../models/University");
const Course = require("../models/Course");
const CourseUnit = require("../models/CourseUnit");
const { escapeRegex } = require("../utils/username.rules");
const { storedTypesFor } = require("../utils/catalogue.rules");
const { normalizeUniversityName, universitySearchTokens } = require("../utils/universitySearch");

const s = (x) => String(x);
const validId = (id) => mongoose.Types.ObjectId.isValid(id);
const CI = { locale: "en", strength: 2 };

module.exports = {
  async userById(id) {
    if (!validId(id)) return null;
    return User.findById(id).select("_id role universityId courseId programme yearOfStudy semester deletedAt").lean();
  },

  // ── institutions ──
  async listInstitutions() {
    return University.find({}).select("_id name institutionType").lean();
  },
  async createInstitution({ name, institutionType }) {
    // create() (not insertMany) so the model's pre-validate hook fills the search fields.
    const doc = await University.create({
      name, institutionType, country: "Kenya", status: "active", verified: false, catalogueSource: "catalogue-seed",
      nameSearch: normalizeUniversityName(name), nameSearchTokens: universitySearchTokens(name),
    });
    return { _id: doc._id, name: doc.name, institutionType: doc.institutionType };
  },
  async fillInstitutionType(id, institutionType) {
    await University.updateOne({ _id: id, institutionType: null }, { $set: { institutionType } });
  },
  async institutionById(id) {
    if (!validId(id)) return null;
    return University.findById(id).select("_id name institutionType").lean();
  },
  async searchInstitutions({ institutionType, q, limit }) {
    const query = { status: "active" };
    if (institutionType) query.institutionType = { $in: storedTypesFor(institutionType) };
    if (q) query.nameSearch = { $regex: escapeRegex(q), $options: "i" };
    return University.find(query).select("_id name institutionType verified").sort({ name: 1 }).limit(limit).lean();
  },

  // ── courses ──
  async listCourses(universityId) {
    return Course.find({ universityId: s(universityId) }).select("_id code title level qualificationLevel durationYears semestersPerYear verificationStatus").lean();
  },
  async createCourse(doc) {
    const created = await Course.create({
      title: doc.title, code: doc.code, description: doc.description || "", universityId: s(doc.universityId),
      level: doc.level, durationYears: doc.durationYears ?? null, semestersPerYear: doc.semestersPerYear || 2,
      verificationStatus: doc.verificationStatus || "needs_verification", catalogueSource: doc.catalogueSource || "catalogue-seed",
    });
    return { _id: created._id, code: created.code, title: created.title, level: created.level, durationYears: created.durationYears, semestersPerYear: created.semestersPerYear, verificationStatus: created.verificationStatus };
  },
  // Only ever sets fields that are currently empty.
  async fillCourse(id, fields) {
    for (const [key, value] of Object.entries(fields)) {
      await Course.updateOne({ _id: id, $or: [{ [key]: null }, { [key]: "" }] }, { $set: { [key]: value } });
    }
  },
  async updateCourse(id, set) {
    await Course.updateOne({ _id: id }, { $set: set });
  },
  async courseById(id) {
    if (!validId(id)) return null;
    return Course.findById(id).select("_id code title level qualificationLevel durationYears semestersPerYear verificationStatus universityId").lean();
  },
  async searchCourses({ universityId, level, q, limit }) {
    const query = { universityId: s(universityId) };
    if (level) query.$and = [{ $or: [{ level }, { qualificationLevel: level }] }];
    if (q) {
      const rx = { $regex: escapeRegex(q), $options: "i" };
      query.$or = [{ title: rx }, { code: rx }];
    }
    return Course.find(query).select("_id code title level qualificationLevel durationYears semestersPerYear verificationStatus").sort({ title: 1 }).limit(limit).lean();
  },
  async enrolledCourses(userId, universityId) {
    return Course.find({ enrolledStudentIds: s(userId), universityId: s(universityId) })
      .select("_id code title level qualificationLevel durationYears semestersPerYear verificationStatus universityId").lean();
  },
  async setCourseIfEmpty(userId, courseId) {
    await User.updateOne(
      { _id: userId, $or: [{ courseId: null }, { courseId: "" }] },
      { $set: { courseId: s(courseId) } }
    );
  },

  // ── units ──
  async unitCodesOfCourse(courseId) {
    const rows = await CourseUnit.find({ courseId: s(courseId) }).select("code").collation(CI).lean();
    return rows.map((r) => r.code);
  },
  async insertUnits(courseId, universityId, units, source) {
    if (!units.length) return;
    const ops = units.map((u) => ({
      updateOne: {
        filter: { courseId: s(courseId), code: u.code },
        update: { $setOnInsert: { ...u, courseId: s(courseId), universityId: s(universityId), verificationStatus: "needs_verification", source, status: "active" } },
        upsert: true,
        collation: CI,
      },
    }));
    await CourseUnit.bulkWrite(ops, { ordered: false });
  },
  async upsertUnits(courseId, universityId, units, verificationStatus, source) {
    const existing = new Set((await CourseUnit.find({ courseId: s(courseId) }).select("code").collation(CI).lean()).map((r) => r.code));
    let created = 0, updated = 0;
    const ops = units.map((u) => {
      if (existing.has(u.code)) updated += 1; else created += 1;
      return {
        updateOne: {
          filter: { courseId: s(courseId), code: u.code },
          update: {
            $set: { name: u.name, description: u.description, credits: u.credits, yearOfStudy: u.yearOfStudy, semester: u.semester, verificationStatus, source, status: "active" },
            $setOnInsert: { courseId: s(courseId), universityId: s(universityId), code: u.code },
          },
          upsert: true,
          collation: CI,
        },
      };
    });
    if (ops.length) await CourseUnit.bulkWrite(ops, { ordered: false });
    return { created, updated };
  },
  async setUnitsVerification(courseId, verificationStatus) {
    const r = await CourseUnit.updateMany({ courseId: s(courseId) }, { $set: { verificationStatus } });
    return r.modifiedCount ?? r.nModified ?? 0;
  },
  async unitsOfCourse(courseId) {
    return CourseUnit.find({ courseId: s(courseId), status: "active" })
      .select("_id code name description credits yearOfStudy semester verificationStatus").lean();
  },
  async unitCounts(courseIds) {
    if (!courseIds.length) return {};
    const rows = await CourseUnit.aggregate([
      { $match: { courseId: { $in: courseIds.map(s) }, status: "active" } },
      { $group: { _id: "$courseId", n: { $sum: 1 } } },
    ]);
    return Object.fromEntries(rows.map((r) => [r._id, r.n]));
  },
};
