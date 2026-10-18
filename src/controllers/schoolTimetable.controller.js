"use strict";

// School timetable. Admins write it and publish it. For 14 days, lecturers and students of that
// university can comment and approve or object; the window then closes by itself and the admin can
// finalize. Participants see vote TOTALS (lecturers and students separately) and their own vote, not
// who voted which way; admins see every response. It is a reference timetable: it does not change
// the class times students and lecturers see in their courses.
const mongoose = require("mongoose");
const User = require("../models/User");
const University = require("../models/University");
const AuditLog = require("../models/AuditLog");
const SchoolTimetable = require("../models/SchoolTimetable");
const Comment = require("../models/SchoolTimetableComment");
const Vote = require("../models/SchoolTimetableVote");
const { clampInt, cleanText, resolveUniversity, scopeFilter, inScope } = require("../utils/adminScope");
const R = require("../utils/schoolTimetable.rules");
const { notifyAudienceInBackground } = require("../services/audience.notify");

const MAX_COMMENTS_PER_PERSON = 10;
const fail = (res, status, message) => res.status(status).json({ status: "error", message });
const isId = (v) => mongoose.isValidObjectId(v);
const pagination = (total, p, l) => ({ page: p, limit: l, total, totalPages: Math.max(1, Math.ceil(total / l)) });
const people = (role, universityId) => ({ role, universityId: String(universityId), removedAt: null, status: { $nin: ["terminated", "suspended"] } });
const niceDate = (d) => new Date(d).toLocaleDateString("en-GB", { day: "numeric", month: "short", year: "numeric" });

async function audit(actor, action, id, details) {
  try {
    await AuditLog.create({ adminId: actor.id, adminEmail: actor.email, action, targetType: "SchoolTimetable", targetId: String(id), result: "success", details: details ? JSON.stringify(details) : undefined });
  } catch (e) {
    console.error("Audit log failed:", e.message);
  }
}

// Tell the lecturers and students of the timetable's university. Runs in the background.
const announce = (t, title, message) =>
  notifyAudienceInBackground({ universityId: t.universityId, roles: ["lecturer", "student"], type: "timetable", title, message, link: `/school-timetable/${t._id}`, context: {} });

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
const participantWrap = (fn) => async (req, res) => {
  try {
    const u = await User.findById(req.user.id).select("role universityId name removedAt");
    if (!u || !["lecturer", "student"].includes(u.role) || u.removedAt || !u.universityId) {
      return fail(res, 403, "Only lecturers and students of the university can take part.");
    }
    await fn(req, res, { id: String(u._id), role: u.role, universityId: String(u.universityId), name: u.name });
  } catch (error) {
    console.error(`[schoolTimetable] ${req.method} ${req.originalUrl}:`, error);
    fail(res, 500, "Something went wrong. Please try again.");
  }
};

async function universityName(id) {
  if (!isId(id)) return "Unknown university";
  return (await University.findById(id).select("name"))?.name || "Unknown university";
}
async function counts(universityId) {
  const [lecturer, student] = await Promise.all([User.countDocuments(people("lecturer", universityId)), User.countDocuments(people("student", universityId))]);
  return { lecturer, student };
}

// ---------- admin ----------
async function loadForAdmin(req, res, actor) {
  if (!isId(req.params.id)) { fail(res, 404, "Timetable not found."); return null; }
  const t = await SchoolTimetable.findById(req.params.id);
  if (!t || !inScope(actor, t.universityId)) { fail(res, 404, "Timetable not found."); return null; }
  return t;
}

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
  const cnt = new Map(await Promise.all(unis.map(async (id) => [id, await counts(id)])));
  const votes = await Vote.find({ timetableId: { $in: rows.map((r) => String(r._id)) } }).select("timetableId version vote role");
  res.json({
    status: "success",
    data: rows.map((t) => ({
      id: t._id, title: t.title, term: t.term, universityId: t.universityId, universityName: names.get(String(t.universityId)) || "Unknown university",
      status: t.status, version: t.version, rows: t.entries.length, publishedAt: t.publishedAt, finalizedAt: t.finalizedAt, updatedAt: t.updatedAt,
      suggestionsCloseAt: R.closeAtOf(t), windowOpen: R.isWindowOpen(t),
      tally: R.tallyByRole(votes.filter((v) => v.timetableId === String(t._id) && v.version === t.version), cnt.get(String(t.universityId)) || { lecturer: 0, student: 0 }),
    })),
    pagination: pagination(total, p, l),
  });
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
  const [lecturers, cnt, votes, comments, uniName] = await Promise.all([
    User.find(people("lecturer", t.universityId)).select("_id name").sort({ name: 1 }).limit(500),
    counts(t.universityId),
    Vote.find({ timetableId: String(t._id), version: t.version }).sort({ updatedAt: -1 }).limit(1000),
    Comment.find({ timetableId: String(t._id) }).sort({ createdAt: 1 }).limit(300),
    universityName(t.universityId),
  ]);
  const voted = new Set(votes.filter((v) => v.role === "lecturer").map((v) => v.userId));
  const fin = R.canFinalize(t);
  res.json({
    status: "success",
    data: {
      id: t._id, title: t.title, term: t.term, universityId: t.universityId, universityName: uniName, status: t.status, version: t.version,
      entries: t.entries, conflicts: R.findConflicts(t.entries).map((c) => ({ type: c.type, day: c.day, a: c.a.unitCode, b: c.b.unitCode })),
      publishedAt: t.publishedAt, finalizedAt: t.finalizedAt, updatedAt: t.updatedAt,
      suggestionsCloseAt: R.closeAtOf(t), windowOpen: R.isWindowOpen(t), canFinalize: fin.ok, finalizeBlockedUntil: fin.closeAt || null,
      lecturerCount: cnt.lecturer, studentCount: cnt.student, tally: R.tallyByRole(votes, cnt),
      responses: votes.map((v) => ({ userId: v.userId, name: v.userName, role: v.role, vote: v.vote, reason: v.reason, updatedAt: v.updatedAt })),
      pendingLecturers: lecturers.filter((u) => !voted.has(String(u._id))).map((u) => ({ id: String(u._id), name: u.name })),
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
  const revising = nextVersion > t.version;
  if (revising) set.suggestionsCloseAt = R.closeAtAfterRevision(R.closeAtOf(t));
  // Conditional on the version I read, so two admins editing a published timetable cannot both win.
  const updated = await SchoolTimetable.findOneAndUpdate(
    { _id: t._id, version: t.version, status: { $in: ["draft", "published"] } },
    { $set: { ...set, version: nextVersion, updatedAt: new Date() } },
    { new: true }
  );
  if (!updated) return fail(res, 409, "Someone else changed this timetable. Reload and try again.");
  await audit(actor, "TIMETABLE_UPDATE", t._id, { fields: Object.keys(set), version: nextVersion });
  if (revising) announce(updated, "School timetable updated", `${updated.title} has a new version. Please look again and vote before ${niceDate(updated.suggestionsCloseAt)}.`);
  res.json({
    status: "success",
    message: revising ? `Saved as a new version. Everyone is asked to vote again, and the window stays open until ${niceDate(updated.suggestionsCloseAt)}.` : "Draft saved.",
    data: { version: nextVersion, conflicts: R.findConflicts(entries).length },
  });
});

async function move(req, res, actor, from, set, action, okMessage, extraCheck, after) {
  const t = await loadForAdmin(req, res, actor);
  if (!t) return;
  if (extraCheck) {
    const problem = extraCheck(t);
    if (problem) return fail(res, 409, problem);
  }
  const updated = await SchoolTimetable.findOneAndUpdate({ _id: t._id, status: from }, { $set: { ...set, updatedAt: new Date() } }, { new: true });
  if (!updated) return fail(res, 409, `This timetable is no longer ${from}. Reload and try again.`);
  await audit(actor, action, t._id, { title: t.title });
  if (after) after(updated);
  res.json({ status: "success", message: okMessage, data: { status: updated.status } });
}

exports.adminPublish = adminWrap((req, res, actor) => {
  const now = new Date();
  const closes = R.windowCloseAt(now);
  return move(
    req, res, actor, "draft", { status: "published", publishedAt: now, suggestionsCloseAt: closes }, "TIMETABLE_PUBLISH",
    `Published. Lecturers and students of this university can respond until ${niceDate(closes)}.`,
    (t) => (t.entries.length ? null : "Add at least one row before publishing."),
    (t) => announce(t, "School timetable: your suggestions wanted", `${t.title} is open for suggestions and votes until ${niceDate(closes)}.`)
  );
});

exports.adminFinalize = adminWrap((req, res, actor) =>
  move(
    req, res, actor, "published", { status: "finalized", finalizedAt: new Date(), finalizedBy: actor.id }, "TIMETABLE_FINALIZE", "Finalized. The discussion is closed.",
    (t) => {
      const can = R.canFinalize(t);
      return can.ok ? null : `The suggestion window is still open until ${niceDate(can.closeAt)}. You can finalize once it closes.`;
    },
    (t) => announce(t, "School timetable finalized", `${t.title} is now final.`)
  )
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

// Admins can remove a comment that breaks the Community Standards.
exports.adminDeleteComment = adminWrap(async (req, res, actor) => {
  const t = await loadForAdmin(req, res, actor);
  if (!t) return;
  if (!isId(req.params.commentId)) return fail(res, 404, "Comment not found.");
  const c = await Comment.findOneAndDelete({ _id: req.params.commentId, timetableId: String(t._id) });
  if (!c) return fail(res, 404, "Comment not found.");
  await audit(actor, "TIMETABLE_COMMENT_DELETE", t._id, { by: c.userId });
  res.json({ status: "success" });
});

// ---------- lecturers and students ----------
async function loadForParticipant(req, res, me) {
  if (!isId(req.params.id)) { fail(res, 404, "Timetable not found."); return null; }
  const t = await SchoolTimetable.findOne({ _id: req.params.id, universityId: me.universityId, status: { $in: ["published", "finalized"] } });
  if (!t) { fail(res, 404, "Timetable not found."); return null; }
  return t;
}
const closedMessage = (t) => (t.status === "finalized" ? "This timetable has been finalized, so the discussion is closed." : `The suggestion window closed on ${niceDate(R.closeAtOf(t))}.`);

exports.participantList = participantWrap(async (req, res, me) => {
  const rows = await SchoolTimetable.find({ universityId: me.universityId, status: { $in: ["published", "finalized"] } })
    .select("title term status version publishedAt finalizedAt suggestionsCloseAt entries").sort({ publishedAt: -1 }).limit(50);
  const mine = await Vote.find({ userId: me.id, timetableId: { $in: rows.map((r) => String(r._id)) } }).select("timetableId version vote");
  res.json({
    status: "success",
    data: rows.map((r) => ({
      id: r._id, title: r.title, term: r.term, status: r.status, version: r.version, rows: r.entries.length, publishedAt: r.publishedAt,
      suggestionsCloseAt: R.closeAtOf(r), windowOpen: R.isWindowOpen(r),
      myVote: mine.find((v) => v.timetableId === String(r._id) && v.version === r.version)?.vote || null,
    })),
  });
});

exports.participantGet = participantWrap(async (req, res, me) => {
  const t = await loadForParticipant(req, res, me);
  if (!t) return;
  const [cnt, votes, comments] = await Promise.all([
    counts(me.universityId),
    Vote.find({ timetableId: String(t._id), version: t.version }),
    Comment.find({ timetableId: String(t._id) }).sort({ createdAt: 1 }).limit(300),
  ]);
  const mine = votes.find((v) => v.userId === me.id);
  res.json({
    status: "success",
    data: {
      id: t._id, title: t.title, term: t.term, status: t.status, version: t.version, publishedAt: t.publishedAt, finalizedAt: t.finalizedAt,
      suggestionsCloseAt: R.closeAtOf(t), windowOpen: R.isWindowOpen(t), role: me.role,
      entries: t.entries, tally: R.tallyByRole(votes, cnt), myVote: mine ? { vote: mine.vote, reason: mine.reason } : null,
      comments: comments.map((c) => ({ id: c._id, userName: c.userName, role: c.role, text: c.text, version: c.version, createdAt: c.createdAt, mine: c.userId === me.id })),
    },
  });
});

exports.participantComment = participantWrap(async (req, res, me) => {
  const t = await loadForParticipant(req, res, me);
  if (!t) return;
  if (!R.isWindowOpen(t)) return fail(res, 409, closedMessage(t));
  const text = cleanText(req.body?.text, 1000);
  if (!text) return fail(res, 400, "Write a comment of 1 to 1000 characters.");
  if ((await Comment.countDocuments({ timetableId: String(t._id), userId: me.id })) >= MAX_COMMENTS_PER_PERSON) {
    return fail(res, 429, `You have reached the limit of ${MAX_COMMENTS_PER_PERSON} comments on this timetable. Put the rest in one comment, or raise it with your admin.`);
  }
  const c = await Comment.create({ timetableId: String(t._id), version: t.version, userId: me.id, userName: me.name || (me.role === "lecturer" ? "Lecturer" : "Student"), role: me.role, text });
  res.status(201).json({ status: "success", data: { id: c._id, userName: c.userName, role: c.role, text: c.text, version: c.version, createdAt: c.createdAt, mine: true } });
});

exports.participantVote = participantWrap(async (req, res, me) => {
  const t = await loadForParticipant(req, res, me);
  if (!t) return;
  if (!R.isWindowOpen(t)) return fail(res, 409, closedMessage(t));
  const parsed = R.parseVote(req.body);
  if (!parsed.ok) return fail(res, 400, parsed.message);
  try {
    await Vote.findOneAndUpdate(
      { timetableId: String(t._id), userId: me.id, version: t.version },
      { $set: { vote: parsed.vote, reason: parsed.reason, userName: me.name || "", role: me.role, updatedAt: new Date() } },
      { upsert: true, new: true, setDefaultsOnInsert: true }
    );
  } catch (e) {
    if (e?.code !== 11000) throw e; // two taps at once: the other write already recorded a vote
  }
  const [cnt, votes] = await Promise.all([counts(me.universityId), Vote.find({ timetableId: String(t._id), version: t.version })]);
  res.json({ status: "success", data: { myVote: { vote: parsed.vote, reason: parsed.reason }, tally: R.tallyByRole(votes, cnt) } });
});
