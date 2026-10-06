"use strict";

// The only file in the units feature that touches mongoose. Deliberately thin: every decision
// lives in units.core.js (unit-tested). Syntax-checked only until it has run against a real database.

const mongoose = require("mongoose");
const User = require("../models/User");
const Course = require("../models/Course");
const { escapeRegex } = require("../utils/username.rules");

const s = (x) => String(x);
const validId = (id) => mongoose.Types.ObjectId.isValid(id);

module.exports = {
  async userById(id) {
    if (!validId(id)) return null;
    return User.findById(id).select("_id name role universityId deletedAt status").lean();
  },

  async usersByIds(ids) {
    const good = ids.filter(validId);
    if (!good.length) return [];
    return User.find({ _id: { $in: good }, deletedAt: null }).select("_id name").lean();
  },

  async courseById(id) {
    if (!validId(id)) return null;
    return Course.findById(id).lean();
  },

  // Same scoping as the old getCourses: student -> enrolled, lecturer -> theirs, others -> all.
  async listCoursesFor({ role, userId }) {
    let query = {};
    if (role === "student") query = { enrolledStudentIds: s(userId) };
    else if (role === "lecturer") query = { lecturerId: s(userId) };
    return Course.find(query).sort({ createdAt: -1 }).lean();
  },

  async searchCourses({ universityId, q, limit }) {
    const query = { universityId };
    if (q) {
      const rx = { $regex: escapeRegex(q), $options: "i" };
      query.$or = [{ title: rx }, { code: rx }];
    }
    return Course.find(query).sort({ title: 1 }).limit(limit).lean();
  },

  async countEnrolled(userId) {
    return Course.countDocuments({ enrolledStudentIds: s(userId) });
  },

  // Atomic and idempotent: only matches (and modifies) when the student isn't already in the array.
  async addEnrollment(courseId, userId) {
    const r = await Course.updateOne(
      { _id: courseId, enrolledStudentIds: { $ne: s(userId) } },
      { $addToSet: { enrolledStudentIds: s(userId) } }
    );
    return (r.modifiedCount ?? r.nModified ?? 0) === 1;
  },

  async removeEnrollment(courseId, userId) {
    const r = await Course.updateOne({ _id: courseId }, { $pull: { enrolledStudentIds: s(userId) } });
    return (r.modifiedCount ?? r.nModified ?? 0) === 1;
  },
};
