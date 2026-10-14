"use strict";

// School timetable: admins write it and publish it, lecturers of that university discuss it with
// comments and an approve/object vote, and the admin finalizes it. Lecturers see vote TOTALS and
// their own vote, not who voted which way; admins see every response.
const mongoose = require("mongoose");
const User = require("../models/User");
const University = require("../models/University");
const AuditLog = require("../models/AuditLog");
const SchoolTimetable = require("../models/SchoolTimetable");
const Comment = require("../models/SchoolTimetableComment");
const Vote = require("../models/SchoolTimetableVote");
const { clampInt, cleanText, resolveUniversity, scopeFilter, inScope } = require("../utils/adminScope");
const R = require("../utils/schoolTimetable.rules");

const fail = (res, status, message) => res.status(status).json({ status: "error", message });
const isId = (v) => mongoose.isValidObjectId(v);
const pagination = (total, p, l) => ({ page: p, limit: l, total, totalPages: Math.max(1, Math.ceil(total / l)) });
const activeLecturers = (universityId) => ({ role: "lecturer", universityId: String(universityId), removedAt: null, status: "active" });

async function audit(actor, action, id, details) {
  try {
    await AuditLog.create({ adminId: actor.id, adminEmail: actor.email, action, targetType: "SchoolTimetable", targetId: String(id), result: "success", details: details ? JSON.stringify(details) : undefined });
  } catch (e) {
    console.error("Audit log failed:", e.message);
  }
}

const adminWrap = (fn) => async (req, res) => {
  try {
    const u = await User.findById(req.user.id).select("role universityId email name");
    if (!u || !["admin", "superadmin"].includes(u.role)) return fail(res, 403, "Admins only.");
    await fn(req, res, { id: String(u._id), role: u.role, universityId: u.universityId || null, email: u.email, name: u.name });
  } catch (error) {
    console.error(`[schoolTimetable] ${req.method} ${req.originalUrl}:`, error);
    fail(res, 500, "Something went wrong. Please try again.");
  }
};
const lecturerWrap = (fn) => async (req, res) => {
  try {
    const u = await User.findById(req.user.id).select("role universityId name removedAt");
    if (!u || u.role !== "lecturer" || u.removedAt || !u.universityId) return fail(res, 403, "Lecturers only.");
    await fn(req, res, { id: String(u._id), universityId: String(u.universityId), name: u.name });
  } catch (error) {
    console.error(`[schoolTimetable] ${req.method} ${req.originalUrl}:`, error);
    fail(res, 500, "Something went wrong. Please try again.");
  }
};

async function universityName(id) {
  if (!isId(id)) return "Unknown university";
  return (await University.findById(id).select("name"))?.name || "Unknown university";
}

// ---------- admin ----------
async function loadForAdmin(req, res, actor) {
  if (!isId(req.params.id)) { fail(res, 404, "Timetable not found."); return null; }
  const t = await SchoolTimetable.findById(req.params.id);
  if (!t || !inScope(actor, t.universityId)) { fail(res, 404, "Timetable not found."); return null; }
  return t;
}

const adminSummary = (t, names, tallies) => ({
  id: t._id, title: t.title, term: t.term, universityId: t.universityId, universityName: names.get(String(t.universityId)) || "Unknown university",
  status: t.status, version: t.version, rows: t.entries.length, publishedAt: t.publishedAt, finalizedAt: t.finalizedAt, updatedAt: t.updatedAt,
  tally: tallies.get(String(t._id)) || { approve: 0, object: 0, responded: 0, pending: 0 },
});

exports.adminList = adminWrap(async (req, res, actor) => {
  const p = clampInt(req.query.page, 1, 1, 100000);
  const l = clampInt(req.query.limit, 20, 1, 50);
  const filter = { ...scopeFilter(actor) };
  const [total, rows] = await Promise.all([
    SchoolTimetable.countDocuments(filter),
    SchoolTimetable.find(filter).select("-entries.unitName").sort({ updatedAt: -1 }).skip((p - 1) * l).limit(l),
  ]);
  const unis = [...new Set(rows.map((r) => String(r.universityId)))];
  const names = new Map(await Promise.all(unis.map(async (id) => [id, await universityName(id)])));
  const counts = new Map(await Promise.all(unis.map(async (id) => [id, await User.countDocuments(activeLecturers(id))])));
  const votes = await Vote.find({ timetableId: { $in: rows.map((r) => String(r._id)) } }).select("timetableId version vote");
  const tallies = new Map(rows.map((r) => [String(r._id), R.tally(votes.filter((v) => v.timetableId === String(r._id) && v.version === r.version), counts.get(String(r.universityId)) || 0)]));
  res.json({ status: "success", data: rows.map((r) => adminSummary(r, names, tallies)), pagination: pagination(total, p, l) });
});

exports.adminCreate = adminWrap(async (req, res, actor) => {
  const title = cleanText(req.body?.title, 150);
  if (!title) return fail(res, 400, "A title is required (150 characters at most).");
  const term = req.body?.term ? cleanText(req.body.term, 80) : "";
  if (term === null) return fail(res, 400, "The term is too long (80 characters at most).");
  const parsed = R.parseEntries(req.body?.entries ?? []);
  if (!parsed.ok) return fail(res, 400, parsed.message);
  const uni = resolveUniversity(actor, req.body?.universityId);
  if (!uni.ok) return fail(res, uni.status, uni.message);
  if (!isId(uni.universityId) || !(await University.exists({ _id: uni.universityId }))) return fail(res, 400, "That university does not exist.");
  const t = await SchoolTimetable.create({ universityId: uni.universityId, title, term, entries: parsed.entries, createdBy: actor.id });
  await audit(actor, "TIMETABLE_CREATE", t._id, { title, universityId: uni.universityId });
  res.status(201).json({ status: "success", message: "Draft saved.", data: { id: t._id, conflicts: R.findConflicts(parsed.entries).length } });
});

exports.adminGet = adminWrap(async (req, res, actor) => {
  const t = await loadForAdmin(req, res, actor);
  if (!t) return;
  const [lecturers, votes, comments, uniName] = await Promise.all([
    User.find(activeLecturers(t.universityId)).select("_id name").sort({ name: 1 }).limit(500),
    Vote.find({ timetableId: String(t._id), version: t.version }),
    Comment.find({ timetableId: String(t._id) }).sort({ createdAt: 1 }).limit(300),
    universityName(t.universityId),
  ]);
  const byUser = new Map(votes.map((v) => [v.userId, v]));
  res.json({
    status: "success",
    data: {
      id: t._id, title: t.title, term: t.term, universityId: t.universityId, universityName: uniName, status: t.status, version: t.version,
      entries: t.entries, conflicts: R.findConflicts(t.entries).map((c) => ({ type: c.type, day: c.day, a: c.a.unitCode, b: c.b.unitCode })),
      publishedAt: t.publishedAt, finalizedAt: t.finalizedAt, updatedAt: t.updatedAt,
      lecturerCount: lecturers.length, tally: R.tally(votes, lecturers.length),
      responses: votes.map((v) => ({ userId: v.userId, name: v.userName, vote: v.vote, reason: v.reason, updatedAt: v.updatedAt })),
      pendingLecturers: lecturers.filter((u) => !byUser.has(String(u._id))).map((u) => ({ id: String(u._id), name: u.name })),
      comments: comments.map((c) => ({ id: c._id, userName: c.userName, role: c.role, text: c.text, version: c.version, createdAt: c.createdAt })),
    },
  });
});

exports.adminUpdate = adminWrap(async (req, res, actor) => {
  const t = await loadForAdmin(req, res, actor);
  if (!t) return;
  if (!R.canEdit(t.status)) return fail(res, 409, "A finalized timetable cannot be edited.");
  const set = {};
  if (req.body?.title !== undefined) {
    const title = cleanText(req.body.title, 150);
    if (!title) return fail(res, 400, "A title is required (150 characters at most).");
    set.title = title;
  }
  if (req.body?.term !== undefined) {
    const term = req.body.term === "" ? "" : cleanText(req.body.term, 80);
    if (term === null) return fail(res, 400, "The term is too long (80 characters at most).");
    set.term = term;
  }
  let entries = t.entries;
  if (req.body?.entries !== undefined) {
    const parsed = R.parseEntries(req.body.entries);
    if (!parsed.ok) return fail(res, 400, parsed.message);
    set.entries = entries = parsed.entries;
  }
  if (!Object.keys(set).length) return fail(res, 400, "Nothing to update.");
  const nextVersion = R.versionAfterEdit(t.status, t.version);
  // Conditional on the version I read, so two admins editing a published timetable cannot both win.
  const updated = await SchoolTimetable.findOneAndUpdate(
    { _id: t._id, version: t.version, status: { $in: ["draft", "published"] } },
    { $set: { ...set, version: nextVersion, updatedAt: new Date() } },
    { new: true }
  );
  if (!updated) return fail(res, 409, "Someone else changed this timetable. Reload and try again.");
  await audit(actor, "TIMETABLE_UPDATE", t._id, { fields: Object.keys(set), version: nextVersion });
  res.json({ status: "success", message: nextVersion > t.version ? "Saved as a new version. Lecturers need to vote again." : "Draft saved.", data: { version: nextVersion, conflicts: R.findConflicts(entries).length } });
});

async function move(req, res, actor, from, set, action, okMessage, extraCheck) {
  const t = await loadForAdmin(req, res, actor);
  if (!t) return;
  if (extraCheck) {
    const problem = extraCheck(t);
    if (problem) return fail(res, 409, problem);
  }
  const updated = await SchoolTimetable.findOneAndUpdate({ _id: t._id, status: from }, { $set: { ...set, updatedAt: new Date() } }, { new: true });
  if (!updated) return fail(res, 409, `This timetable is no longer ${from}. Reload and try again.`);
  await audit(actor, action, t._id, { title: t.title });
  res.json({ status: "success", message: okMessage, data: { status: updated.status } });
}

exports.adminPublish = adminWrap((req, res, actor) =>
  move(req, res, actor, "draft", { status: "published", publishedAt: new Date() }, "TIMETABLE_PUBLISH", "Published. Lecturers of this university can now discuss it.",
    (t) => (t.entries.length ? null : "Add at least one row before publishing."))
);
exports.adminFinalize = adminWrap((req, res, actor) =>
  move(req, res, actor, "published", { status: "finalized", finalizedAt: new Date(), finalizedBy: actor.id }, "TIMETABLE_FINALIZE", "Finalized. The discussion is closed.")
);

exports.adminDelete = adminWrap(async (req, res, actor) => {
  const t = await loadForAdmin(req, res, actor);
  if (!t) return;
  if (t.status === "finalized" && actor.role !== "superadmin") return fail(res, 403, "Only a superadmin can delete a finalized timetable.");
  await Promise.all([Comment.deleteMany({ timetableId: String(t._id) }), Vote.deleteMany({ timetableId: String(t._id) })]);
  await t.deleteOne();
  await audit(actor, "TIMETABLE_DELETE", t._id, { title: t.title, status: t.status });
  res.json({ status: "success", message: "Timetable deleted." });
});

exports.adminComment = adminWrap(async (req, res, actor) => {
  const t = await loadForAdmin(req, res, actor);
  if (!t) return;
  if (t.status !== "published") return fail(res, 409, "Comments are open only while a timetable is published.");
  const text = cleanText(req.body?.text, 1000);
  if (!text) return fail(res, 400, "Write a comment of 1 to 1000 characters.");
  await Comment.create({ timetableId: String(t._id), version: t.version, userId: actor.id, userName: actor.name || "Admin", role: "admin", text });
  res.status(201).json({ status: "success" });
});

// ---------- lecturers ----------
async function loadForLecturer(req, res, lecturer) {
  if (!isId(req.params.id)) { fail(res, 404, "Timetable not found."); return null; }
  const t = await SchoolTimetable.findOne({ _id: req.params.id, universityId: lecturer.universityId, status: { $in: ["published", "finalized"] } });
  if (!t) { fail(res, 404, "Timetable not found."); return null; }
  return t;
}

exports.lecturerList = lecturerWrap(async (req, res, lecturer) => {
  const rows = await SchoolTimetable.find({ universityId: lecturer.universityId, status: { $in: ["published", "finalized"] } })
    .select("title term status version publishedAt finalizedAt entries").sort({ publishedAt: -1 }).limit(50);
  const mine = await Vote.find({ userId: lecturer.id, timetableId: { $in: rows.map((r) => String(r._id)) } }).select("timetableId version vote");
  res.json({
    status: "success",
    data: rows.map((r) => ({
      id: r._id, title: r.title, term: r.term, status: r.status, version: r.version, rows: r.entries.length, publishedAt: r.publishedAt,
      myVote: mine.find((v) => v.timetableId === String(r._id) && v.version === r.version)?.vote || null,
    })),
  });
});

exports.lecturerGet = lecturerWrap(async (req, res, lecturer) => {
  const t = await loadForLecturer(req, res, lecturer);
  if (!t) return;
  const [count, votes, comments] = await Promise.all([
    User.countDocuments(activeLecturers(lecturer.universityId)),
    Vote.find({ timetableId: String(t._id), version: t.version }),
    Comment.find({ timetableId: String(t._id) }).sort({ createdAt: 1 }).limit(300),
  ]);
  const mine = votes.find((v) => v.userId === lecturer.id);
  res.json({
    status: "success",
    data: {
      id: t._id, title: t.title, term: t.term, status: t.status, version: t.version, publishedAt: t.publishedAt, finalizedAt: t.finalizedAt,
      entries: t.entries, tally: R.tally(votes, count), myVote: mine ? { vote: mine.vote, reason: mine.reason } : null,
      comments: comments.map((c) => ({ id: c._id, userName: c.userName, role: c.role, text: c.text, version: c.version, createdAt: c.createdAt, mine: c.userId === lecturer.id })),
    },
  });
});

exports.lecturerComment = lecturerWrap(async (req, res, lecturer) => {
  const t = await loadForLecturer(req, res, lecturer);
  if (!t) return;
  if (t.status !== "published") return fail(res, 409, "This timetable has been finalized, so the discussion is closed.");
  const text = cleanText(req.body?.text, 1000);
  if (!text) return fail(res, 400, "Write a comment of 1 to 1000 characters.");
  const c = await Comment.create({ timetableId: String(t._id), version: t.version, userId: lecturer.id, userName: lecturer.name || "Lecturer", role: "lecturer", text });
  res.status(201).json({ status: "success", data: { id: c._id, userName: c.userName, role: c.role, text: c.text, version: c.version, createdAt: c.createdAt, mine: true } });
});

exports.lecturerVote = lecturerWrap(async (req, res, lecturer) => {
  const t = await loadForLecturer(req, res, lecturer);
  if (!t) return;
  if (t.status !== "published") return fail(res, 409, "This timetable has been finalized, so voting is closed.");
  const parsed = R.parseVote(req.body);
  if (!parsed.ok) return fail(res, 400, parsed.message);
  try {
    await Vote.findOneAndUpdate(
      { timetableId: String(t._id), userId: lecturer.id, version: t.version },
      { $set: { vote: parsed.vote, reason: parsed.reason, userName: lecturer.name || "", updatedAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (e) {
    if (e?.code !== 11000) throw e; // two taps at once: the other write already recorded a vote
  }
  const [count, votes] = await Promise.all([User.countDocuments(activeLecturers(lecturer.universityId)), Vote.find({ timetableId: String(t._id), version: t.version })]);
  res.json({ status: "success", data: { myVote: { vote: parsed.vote, reason: parsed.reason }, tally: R.tally(votes, count) } });
});
