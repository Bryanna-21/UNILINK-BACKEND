"use strict";

// Admin-panel endpoints that did not exist on the backend: dashboard stats, recent users,
// lecturer management, university and UniLink-wide announcements, and a post list for moderation.
// All routes require admin or superadmin (see adminExtras.routes.js). An admin assigned to a
// university is limited to that university (see utils/adminScope.js).

const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../models/User");
const University = require("../models/University");
const Unit = require("../models/Unit");
const Course = require("../models/Course");
const Exam = require("../models/Exam");
const Post = require("../models/Post");
const Campus = require("../models/Campus");
const Announcement = require("../models/Announcement");
const AuditLog = require("../models/AuditLog");
const EmergencyReport = require("../models/EmergencyReport");
const {
  GLOBAL, escapeRegex, clampInt, cleanText, isValidEmail,
  resolveUniversity, scopeFilter, inScope, canPostGlobal, isUnassigned,
} = require("../utils/adminScope");

const OPEN_STATUSES = ["OPEN", "ACKNOWLEDGED", "RESPONDING", "ESCALATED"];
const fail = (res, status, message) => res.status(status).json({ status: "error", message });
const isId = (v) => mongoose.isValidObjectId(v);

async function loadActor(req) {
  const u = await User.findById(req.user.id).select("role universityId email");
  return u ? { id: String(u._id), role: u.role, universityId: u.universityId || null, email: u.email } : null;
}

// An audit failure must never undo or fail the action it records.
async function audit(actor, action, targetType, targetId, details) {
  try {
    await AuditLog.create({
      adminId: actor.id, adminEmail: actor.email, action, targetType,
      targetId: String(targetId), result: "success", details: details ? JSON.stringify(details) : undefined,
    });
  } catch (e) {
    console.error("Audit log failed:", e.message);
  }
}

const wrap = (fn) => async (req, res) => {
  try {
    const actor = await loadActor(req);
    if (!actor || !["admin", "superadmin"].includes(actor.role)) return fail(res, 403, "Admins only.");
    await fn(req, res, actor);
  } catch (error) {
    console.error(`[adminExtras] ${req.method} ${req.originalUrl}:`, error);
    fail(res, 500, "Something went wrong. Please try again.");
  }
};

const universityExists = async (id) => isId(id) && !!(await University.exists({ _id: id }));
const emailTaken = (email, exceptId) =>
  User.findOne({ email: new RegExp(`^${escapeRegex(email)}$`, "i"), ...(exceptId ? { _id: { $ne: exceptId } } : {}) }).select("_id role status removedAt");

// ---------- who am I / my scope ----------
exports.getScope = wrap(async (req, res, actor) => {
  let universityName = null;
  if (actor.universityId && isId(actor.universityId)) {
    universityName = (await University.findById(actor.universityId).select("name"))?.name || null;
  }
  res.json({
    status: "success",
    data: { role: actor.role, universityId: actor.universityId, universityName, canPostGlobal: canPostGlobal(actor), assigned: !isUnassigned(actor) },
  });
});

// ---------- dashboard ----------
exports.getStats = wrap(async (req, res, actor) => {
  const scope = scopeFilter(actor);
  const uniFilter = scope.universityId && isId(scope.universityId) ? { _id: scope.universityId } : {};
  const [totalUsers, totalStudents, totalLecturers, totalAdmins, totalUniversities, totalUnits, activeCourses, totalExams, openReports, logs] =
    await Promise.all([
      User.countDocuments({ ...scope }),
      User.countDocuments({ ...scope, role: "student" }),
      User.countDocuments({ ...scope, role: "lecturer", removedAt: null }),
      User.countDocuments({ ...scope, role: { $in: ["admin", "superadmin"] } }),
      University.countDocuments(uniFilter),
      Unit.countDocuments({ ...scope }),
      Course.countDocuments({ ...scope }),
      Exam.countDocuments({ ...scope }),
      EmergencyReport.countDocuments({ status: { $in: OPEN_STATUSES } }),
      AuditLog.find({}).sort({ createdAt: -1 }).limit(8),
    ]);
  const mongoUp = mongoose.connection.readyState === 1;
  res.json({
    status: "success",
    data: {
      totalUsers, totalStudents, totalUniversities, openReports,
      overview: { totalStudents, totalLecturers, totalAdmins, totalUniversities, totalUnits, activeCourses, totalExams },
      recentActivity: {
        auditLogs: logs.map((l) => ({
          id: String(l._id), action: l.action, admin: l.adminEmail, targetType: l.targetType, result: l.result, timestamp: l.createdAt,
        })),
      },
      systemHealth: { status: mongoUp ? "healthy" : "degraded", database: mongoUp ? "Connected" : "Disconnected", uptime: Math.floor(process.uptime()) },
    },
  });
});

exports.getRecentUsers = wrap(async (req, res, actor) => {
  const limit = clampInt(req.query.limit, 8, 1, 20);
  const users = await User.find({ ...scopeFilter(actor) }).sort({ createdAt: -1 }).limit(limit).select("_id name email role createdAt");
  res.json({
    status: "success",
    data: users.map((u) => ({ _id: u._id, id: u._id, name: u.name, email: u.email, role: u.role, createdAt: u.createdAt })),
  });
});

// ---------- lecturers ----------
const lecturerView = (l) => ({
  id: l._id, name: l.name, email: l.email, department: l.department || "",
  status: l.status === "active" ? "active" : "inactive", universityId: l.universityId || null, createdAt: l.createdAt,
});

exports.listLecturers = wrap(async (req, res, actor) => {
  const page = clampInt(req.query.page, 1, 1, 100000);
  const limit = clampInt(req.query.limit, 10, 1, 100);
  const query = { role: "lecturer", removedAt: null, ...scopeFilter(actor) };
  const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 60) : "";
  if (search) {
    const re = new RegExp(escapeRegex(search), "i");
    query.$or = [{ name: re }, { email: re }, { department: re }];
  }
  const [total, rows] = await Promise.all([
    User.countDocuments(query),
    User.find(query).select("_id name email department status universityId createdAt").sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
  ]);
  res.json({ status: "success", data: rows.map(lecturerView), pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } });
});

exports.createLecturer = wrap(async (req, res, actor) => {
  const name = cleanText(req.body?.name, 100);
  const email = String(req.body?.email ?? "").trim();
  const password = String(req.body?.password ?? "");
  const department = req.body?.department ? cleanText(req.body.department, 100) : "";
  if (!name) return fail(res, 400, "Name is required (100 characters at most).");
  if (!isValidEmail(email)) return fail(res, 400, "Enter a valid email address.");
  if (password.length < 8 || password.length > 72) return fail(res, 400, "Password must be 8 to 72 characters long.");
  if (department === null) return fail(res, 400, "Department is too long.");

  const uni = resolveUniversity(actor, req.body?.universityId);
  if (!uni.ok) return fail(res, uni.status, uni.message);
  if (!(await universityExists(uni.universityId))) return fail(res, 400, "That university does not exist.");

  const clash = await emailTaken(email);
  if (clash) {
    return fail(res, 409, clash.role === "lecturer" && clash.removedAt
      ? "A lecturer with this email was removed earlier and cannot be added again from here."
      : "An account with this email already exists.");
  }
  let lecturer;
  try {
    lecturer = await User.create({
      name, email, password: await bcrypt.hash(password, 10), role: "lecturer", status: "active",
      isVerified: true, universityId: uni.universityId, department,
    });
  } catch (e) {
    if (e?.code === 11000) return fail(res, 409, "An account with this email already exists.");
    throw e;
  }
  await audit(actor, "LECTURER_CREATE", "User", lecturer._id, { name, email, universityId: uni.universityId });
  res.status(201).json({ status: "success", message: "Lecturer added.", data: lecturerView(lecturer) });
});

async function loadLecturer(req, res, actor) {
  if (!isId(req.params.id)) { fail(res, 404, "Lecturer not found."); return null; }
  const target = await User.findById(req.params.id).select("_id name email role status removedAt universityId department createdAt");
  // Out-of-scope and wrong-role both look like "not found" so ids cannot be probed.
  if (!target || target.role !== "lecturer" || !inScope(actor, target.universityId)) { fail(res, 404, "Lecturer not found."); return null; }
  return target;
}

exports.updateLecturer = wrap(async (req, res, actor) => {
  const target = await loadLecturer(req, res, actor);
  if (!target) return;
  const update = {};
  if (req.body?.name !== undefined) {
    const name = cleanText(req.body.name, 100);
    if (!name) return fail(res, 400, "Name is required (100 characters at most).");
    update.name = name;
  }
  if (req.body?.email !== undefined) {
    const email = String(req.body.email).trim();
    if (!isValidEmail(email)) return fail(res, 400, "Enter a valid email address.");
    if (email !== target.email && (await emailTaken(email, target._id))) return fail(res, 409, "An account with this email already exists.");
    update.email = email;
  }
  if (req.body?.department !== undefined) {
    const d = req.body.department === "" ? "" : cleanText(req.body.department, 100);
    if (d === null) return fail(res, 400, "Department is too long.");
    update.department = d;
  }
  if (req.body?.status !== undefined) {
    if (!["active", "suspended"].includes(req.body.status)) return fail(res, 400, "Status must be active or suspended.");
    update.status = req.body.status;
  }
  if (!Object.keys(update).length) return fail(res, 400, "Nothing to update.");
  try {
    await User.updateOne({ _id: target._id }, { $set: update });
  } catch (e) {
    if (e?.code === 11000) return fail(res, 409, "An account with this email already exists.");
    throw e;
  }
  await audit(actor, "LECTURER_UPDATE", "User", target._id, update);
  res.json({ status: "success", message: "Lecturer updated." });
});

// "Remove" ends the lecturer's access and signs them out, but keeps the record so exams, timetables
// and announcements they created do not point at a missing account.
exports.removeLecturer = wrap(async (req, res, actor) => {
  const target = await loadLecturer(req, res, actor);
  if (!target) return;
  if (!target.removedAt) {
    await User.updateOne({ _id: target._id }, { $set: { removedAt: new Date() }, $inc: { tokenVersion: 1 } });
    await audit(actor, "LECTURER_REMOVE", "User", target._id, { email: target.email });
  }
  res.json({ status: "success", message: "Lecturer removed." });
});

// ---------- announcements ----------
exports.createAnnouncement = wrap(async (req, res, actor) => {
  const title = cleanText(req.body?.title, 150);
  const body = cleanText(req.body?.body, 2000);
  if (!title) return fail(res, 400, "A title is required (150 characters at most).");
  if (!body) return fail(res, 400, "A message is required (2000 characters at most).");

  let universityId;
  let campusId = null;
  if (req.body?.global === true || req.body?.universityId === GLOBAL) {
    if (!canPostGlobal(actor)) return fail(res, 403, "Only a superadmin or a platform admin can post UniLink-wide announcements.");
    universityId = GLOBAL;
  } else {
    const uni = resolveUniversity(actor, req.body?.universityId);
    if (!uni.ok) return fail(res, uni.status, uni.message);
    if (!(await universityExists(uni.universityId))) return fail(res, 400, "That university does not exist.");
    universityId = uni.universityId;
    if (req.body?.campusId) {
      if (!isId(req.body.campusId) || !(await Campus.exists({ _id: req.body.campusId, universityId }))) {
        return fail(res, 400, "That campus does not belong to the chosen university.");
      }
      campusId = req.body.campusId;
    }
  }
  const created = await Announcement.create({ title, body, universityId, campusId, postedBy: actor.id });
  await audit(actor, "ANNOUNCEMENT_CREATE", "Announcement", created._id, { title, universityId });
  res.status(201).json({ status: "success", message: "Announcement posted.", data: { id: created._id } });
});

exports.listAnnouncements = wrap(async (req, res, actor) => {
  const page = clampInt(req.query.page, 1, 1, 100000);
  const limit = clampInt(req.query.limit, 20, 1, 50);
  const filter = isUnassigned(actor) ? {} : { universityId: { $in: [String(actor.universityId), GLOBAL] } };
  const [total, rows] = await Promise.all([
    Announcement.countDocuments(filter),
    Announcement.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
  ]);
  const uniIds = [...new Set(rows.map((r) => r.universityId).filter((v) => v !== GLOBAL && isId(v)))];
  const userIds = [...new Set(rows.map((r) => r.postedBy).filter(isId))];
  const [unis, users] = await Promise.all([
    University.find({ _id: { $in: uniIds } }).select("name"),
    User.find({ _id: { $in: userIds } }).select("name"),
  ]);
  const uniName = new Map(unis.map((u) => [String(u._id), u.name]));
  const userName = new Map(users.map((u) => [String(u._id), u.name]));
  res.json({
    status: "success",
    data: rows.map((r) => ({
      id: r._id, title: r.title, body: r.body, universityId: r.universityId,
      universityName: r.universityId === GLOBAL ? "UniLink (all universities)" : uniName.get(String(r.universityId)) || "Unknown university",
      postedByName: userName.get(String(r.postedBy)) || "Former admin", createdAt: r.createdAt,
    })),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
});

exports.deleteAnnouncement = wrap(async (req, res, actor) => {
  if (!isId(req.params.id)) return fail(res, 404, "Announcement not found.");
  const a = await Announcement.findById(req.params.id);
  const allowed = a && (a.universityId === GLOBAL ? isUnassigned(actor) || String(a.postedBy) === actor.id : inScope(actor, a.universityId));
  if (!a || !allowed) return fail(res, 404, "Announcement not found.");
  await a.deleteOne();
  await audit(actor, "ANNOUNCEMENT_DELETE", "Announcement", a._id, { title: a.title });
  res.json({ status: "success", message: "Announcement deleted." });
});

// ---------- posts (moderation list; deleting uses the existing DELETE /api/posts/:id) ----------
exports.listPosts = wrap(async (req, res, actor) => {
  const page = clampInt(req.query.page, 1, 1, 100000);
  const limit = clampInt(req.query.limit, 20, 1, 50);
  const filter = { ...scopeFilter(actor) };
  const search = typeof req.query.search === "string" ? req.query.search.trim().slice(0, 60) : "";
  if (search) {
    const re = new RegExp(escapeRegex(search), "i");
    filter.$or = [{ title: re }, { content: re }];
  }
  const [total, rows] = await Promise.all([
    Post.countDocuments(filter),
    Post.find(filter).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit),
  ]);
  const authorIds = [...new Set(rows.map((p) => String(p.userId)).filter(isId))];
  const authors = await User.find({ _id: { $in: authorIds } }).select("name role");
  const byId = new Map(authors.map((u) => [String(u._id), u]));
  res.json({
    status: "success",
    data: rows.map((p) => ({
      id: p._id, title: p.title || "", content: String(p.content || "").slice(0, 300),
      mediaCount: Array.isArray(p.media) ? p.media.length : 0,
      authorName: byId.get(String(p.userId))?.name || "Unknown", authorRole: byId.get(String(p.userId))?.role || "",
      universityId: p.universityId || null, createdAt: p.createdAt,
    })),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
});
