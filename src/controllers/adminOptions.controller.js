"use strict";

// Complete pick-lists for the admin forms. The normal list endpoints cap a page at 100 rows and
// there are 197 universities, so a dropdown built from them silently missed nearly half.
// An admin tied to a university only gets that university.
const mongoose = require("mongoose");
const User = require("../models/User");
const University = require("../models/University");
const Faculty = require("../models/Faculty");
const { scopeFilter } = require("../utils/adminScope");

const handler = (build) => async (req, res) => {
  try {
    const u = await User.findById(req.user.id).select("role universityId");
    if (!u || !["admin", "superadmin"].includes(u.role)) {
      return res.status(403).json({ status: "error", message: "Admins only." });
    }
    const actor = { role: u.role, universityId: u.universityId || null };
    res.json({ status: "success", data: await build(actor) });
  } catch (error) {
    console.error(`[adminOptions] ${req.originalUrl}:`, error);
    res.status(500).json({ status: "error", message: "Something went wrong. Please try again." });
  }
};

exports.universities = handler(async (actor) => {
  const scope = scopeFilter(actor);
  const filter = scope.universityId && mongoose.isValidObjectId(scope.universityId) ? { _id: scope.universityId } : {};
  const rows = await University.find(filter).select("name").sort({ name: 1 }).limit(1000);
  return rows.map((r) => ({ id: String(r._id), name: r.name }));
});

exports.faculties = handler(async (actor) => {
  const rows = await Faculty.find({ ...scopeFilter(actor) }).select("name universityId").sort({ name: 1 }).limit(1000);
  return rows.map((r) => ({ id: String(r._id), name: r.name, universityId: r.universityId ? String(r.universityId) : null }));
});
