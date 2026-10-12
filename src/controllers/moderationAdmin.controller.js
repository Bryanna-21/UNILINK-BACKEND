"use strict";

// Moderator side of content reports: a queue, review, notes, escalation and a decision.
// (The reporter side already existed in safety.controller.) This is deliberately NON-destructive:
// it records decisions and keeps a full event trail. Acting on the content or the account itself
// uses the existing tools (delete a post; suspend a user).
const mongoose = require("mongoose");
const User = require("../models/User");
const AuditLog = require("../models/AuditLog");
const ContentReport = require("../models/ContentReport");
const R = require("../utils/moderation.rules");
const { clampInt, cleanText } = require("../utils/adminScope");
const { visibleFilter, statusFilter, statusForOutcome, canClose } = require("../utils/moderationAdmin.rules");

const fail = (res, status, message) => res.status(status).json({ status: "error", message });
const isId = (v) => mongoose.isValidObjectId(v);

async function loadActor(req) {
  const u = await User.findById(req.user.id).select("role universityId email");
  return u ? { id: String(u._id), role: u.role, universityId: u.universityId || null, email: u.email } : null;
}
async function audit(actor, action, id, details) {
  try {
    await AuditLog.create({ adminId: actor.id, adminEmail: actor.email, action, targetType: "ContentReport", targetId: String(id), result: "success", details: details ? JSON.stringify(details) : undefined });
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
    console.error(`[moderation] ${req.method} ${req.originalUrl}:`, error);
    fail(res, 500, "Something went wrong. Please try again.");
  }
};

const summary = (r, names) => ({
  id: r._id, reference: r.reference, severity: r.severity, category: r.category, entityType: r.entityType,
  status: r.status, imminent: !!r.imminent, dueAt: r.dueAt, overdue: R.OPEN_STATUSES.includes(r.status) && !!r.dueAt && new Date(r.dueAt) < new Date(),
  assignedToName: r.assignedTo ? names.get(String(r.assignedTo)) || "Moderator" : null,
  autoHidden: !!r.autoHidden, createdAt: r.createdAt,
});

exports.list = wrap(async (req, res, actor) => {
  const page = clampInt(req.query.page, 1, 1, 100000);
  const limit = clampInt(req.query.limit, 20, 1, 50);
  const filter = { ...visibleFilter(actor) };
  const status = statusFilter(req.query.status);
  if (status) filter.status = status;
  if (typeof req.query.severity === "string" && R.SEVERITIES.includes(req.query.severity)) filter.severity = req.query.severity;
  const [total, rows] = await Promise.all([
    ContentReport.countDocuments(filter),
    ContentReport.find(filter).select("-evidence -events").sort({ severity: 1, dueAt: 1, createdAt: 1 }).skip((page - 1) * limit).limit(limit),
  ]);
  const ids = [...new Set(rows.map((r) => r.assignedTo).filter(isId))];
  const names = new Map((await User.find({ _id: { $in: ids } }).select("name")).map((u) => [String(u._id), u.name]));
  res.json({ status: "success", data: rows.map((r) => summary(r, names)), pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } });
});

async function loadVisible(req, res, actor) {
  if (!isId(req.params.id)) { fail(res, 404, "Report not found."); return null; }
  const report = await ContentReport.findOne({ _id: req.params.id, ...visibleFilter(actor) });
  if (!report) { fail(res, 404, "Report not found."); return null; }
  return report;
}

// The reporter's identity is never shown to moderators here; they see the reference only.
exports.detail = wrap(async (req, res, actor) => {
  const r = await loadVisible(req, res, actor);
  if (!r) return;
  const userIds = [...new Set([r.assignedTo, r.reportedUserId, r.resolution?.resolvedBy, ...r.events.map((e) => e.actorId)].filter(isId))];
  const users = await User.find({ _id: { $in: userIds } }).select("name role status");
  const byId = new Map(users.map((u) => [String(u._id), u]));
  const name = (id) => (id ? byId.get(String(id))?.name || (id === null ? null : "Moderator") : null);
  const reported = r.reportedUserId ? byId.get(String(r.reportedUserId)) : null;
  res.json({
    status: "success",
    data: {
      ...summary(r, new Map(users.map((u) => [String(u._id), u.name]))),
      description: r.description, entityId: r.entityId, mediaRef: r.mediaRef,
      evidence: { snapshot: r.evidence?.snapshot ?? null, capturedAt: r.evidence?.capturedAt ?? null },
      reportedUser: reported ? { id: String(reported._id), name: reported.name, role: reported.role, status: reported.status } : null,
      resolution: r.resolution?.outcome ? { outcome: r.resolution.outcome, note: r.resolution.note, resolvedByName: name(r.resolution.resolvedBy), resolvedAt: r.resolution.resolvedAt } : null,
      events: r.events.map((e) => ({ at: e.at, type: e.type, from: e.from, to: e.to, note: e.note, actorName: e.actorId ? name(e.actorId) : "System" })),
      outcomes: R.RESOLUTION_OUTCOMES,
    },
  });
});

// Every change is one conditional update, so two moderators acting at once cannot both win.
async function transition(res, actor, id, visible, expectStatuses, set, event, auditAction) {
  const updated = await ContentReport.findOneAndUpdate(
    { _id: id, ...visible, status: { $in: expectStatuses } },
    { $set: { ...set, updatedAt: new Date() }, $push: { events: { at: new Date(), actorId: actor.id, ...event } } },
    { new: true }
  );
  if (!updated) return fail(res, 409, "This report was changed by someone else or is already closed. Reload and try again.");
  await audit(actor, auditAction, id, { to: event.to, note: event.note });
  res.json({ status: "success", data: { id: updated._id, status: updated.status } });
}

exports.assign = wrap(async (req, res, actor) => {
  const r = await loadVisible(req, res, actor);
  if (!r) return;
  if (r.status === "escalated" && actor.role !== "superadmin") return fail(res, 403, "Escalated reports are handled by a superadmin.");
  await transition(res, actor, r._id, visibleFilter(actor), ["open", "in_review"], { status: "in_review", assignedTo: actor.id, assignedAt: new Date() },
    { type: "assigned", from: r.status, to: "in_review", note: "" }, "REPORT_ASSIGN");
});

exports.addNote = wrap(async (req, res, actor) => {
  const r = await loadVisible(req, res, actor);
  if (!r) return;
  const note = cleanText(req.body?.note, 1000);
  if (!note) return fail(res, 400, "Write a note of 1 to 1000 characters.");
  await ContentReport.updateOne({ _id: r._id }, { $push: { events: { at: new Date(), actorId: actor.id, type: "note", note } }, $set: { updatedAt: new Date() } });
  await audit(actor, "REPORT_NOTE", r._id);
  res.json({ status: "success" });
});

exports.escalate = wrap(async (req, res, actor) => {
  const r = await loadVisible(req, res, actor);
  if (!r) return;
  const note = cleanText(req.body?.note, 1000);
  if (!note) return fail(res, 400, "Explain why this needs a superadmin (1 to 1000 characters).");
  await transition(res, actor, r._id, visibleFilter(actor), ["open", "in_review"], { status: "escalated" },
    { type: "escalated", from: r.status, to: "escalated", note }, "REPORT_ESCALATE");
});

exports.resolve = wrap(async (req, res, actor) => {
  const r = await loadVisible(req, res, actor);
  if (!r) return;
  const outcome = req.body?.outcome;
  if (!R.RESOLUTION_OUTCOMES.includes(outcome)) return fail(res, 400, "Choose an outcome.");
  const note = cleanText(req.body?.note, 2000);
  if (!note) return fail(res, 400, "Record why you decided this (1 to 2000 characters).");
  const can = canClose(actor, r);
  if (!can.ok) return fail(res, can.reason === "already_closed" ? 409 : 403, can.reason === "already_closed" ? "This report is already closed." : "Escalated reports are decided by a superadmin.");
  const to = statusForOutcome(outcome);
  await transition(res, actor, r._id, visibleFilter(actor), actor.role === "superadmin" ? R.OPEN_STATUSES : ["open", "in_review"],
    { status: to, "resolution.outcome": outcome, "resolution.note": note, "resolution.resolvedBy": actor.id, "resolution.resolvedAt": new Date() },
    { type: "resolved", from: r.status, to, note: `${outcome}: ${note}`.slice(0, 1000) }, "REPORT_RESOLVE");
});
