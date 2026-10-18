"use strict";

// Loans and sponsorships. Admins post and delete them (admin routes); every signed-in user can read
// the active ones for their university and for all of UniLink (public route).
const mongoose = require("mongoose");
const User = require("../models/User");
const University = require("../models/University");
const AuditLog = require("../models/AuditLog");
const FinancialOpportunity = require("../models/FinancialOpportunity");
const { GLOBAL, clampInt, resolveUniversity, inScope, canPostGlobal, isUnassigned } = require("../utils/adminScope");
const { TYPES, parseOpportunity } = require("../utils/opportunities.rules");
const { notifyAudienceInBackground } = require("../services/audience.notify");

const fail = (res, status, message) => res.status(status).json({ status: "error", message });
const isId = (v) => mongoose.isValidObjectId(v);
const page = (total, p, l) => ({ page: p, limit: l, total, totalPages: Math.max(1, Math.ceil(total / l)) });

async function audit(actor, action, id, details) {
  try {
    await AuditLog.create({ adminId: actor.id, adminEmail: actor.email, action, targetType: "FinancialOpportunity", targetId: String(id), result: "success", details: details ? JSON.stringify(details) : undefined });
  } catch (e) {
    console.error("Audit log failed:", e.message);
  }
}

const adminWrap = (fn) => async (req, res) => {
  try {
    const u = await User.findById(req.user.id).select("role universityId email");
    if (!u || !["admin", "superadmin"].includes(u.role)) return fail(res, 403, "Admins only.");
    await fn(req, res, { id: String(u._id), role: u.role, universityId: u.universityId || null, email: u.email });
  } catch (error) {
    console.error(`[opportunities] ${req.method} ${req.originalUrl}:`, error);
    fail(res, 500, "Something went wrong. Please try again.");
  }
};

const view = (o, uniName) => ({
  id: o._id, type: o.type, title: o.title, provider: o.provider, description: o.description,
  eligibility: o.eligibility || "", amountText: o.amountText || "", link: o.link || "", deadline: o.deadline || null,
  universityId: o.universityId, universityName: o.universityId === GLOBAL ? "All universities" : uniName.get(String(o.universityId)) || "Unknown university",
  createdAt: o.createdAt,
});

async function universityNames(rows) {
  const ids = [...new Set(rows.map((r) => r.universityId).filter((v) => v !== GLOBAL && isId(v)))];
  const unis = await University.find({ _id: { $in: ids } }).select("name");
  return new Map(unis.map((u) => [String(u._id), u.name]));
}

// ---------- admin ----------
exports.create = adminWrap(async (req, res, actor) => {
  const parsed = parseOpportunity(req.body);
  if (!parsed.ok) return fail(res, 400, parsed.message);

  let universityId;
  if (req.body?.global === true || req.body?.universityId === GLOBAL) {
    if (!canPostGlobal(actor)) return fail(res, 403, "Only a superadmin or a platform admin can post for all of UniLink.");
    universityId = GLOBAL;
  } else {
    const uni = resolveUniversity(actor, req.body?.universityId);
    if (!uni.ok) return fail(res, uni.status, uni.message);
    if (!isId(uni.universityId) || !(await University.exists({ _id: uni.universityId }))) return fail(res, 400, "That university does not exist.");
    universityId = uni.universityId;
  }
  const created = await FinancialOpportunity.create({ ...parsed.value, universityId, postedBy: actor.id });
  await audit(actor, "OPPORTUNITY_CREATE", created._id, { type: created.type, title: created.title, universityId });
  notifyAudienceInBackground({
    universityId, roles: ["student"], type: "opportunity",
    title: `New ${created.type}: ${created.title}`, message: `${created.provider}${created.amountText ? ` · ${created.amountText}` : ""}`, link: "/settings/financial-support",
  });
  res.status(201).json({ status: "success", message: "Listing posted.", data: { id: created._id } });
});

exports.list = adminWrap(async (req, res, actor) => {
  const p = clampInt(req.query.page, 1, 1, 100000);
  const l = clampInt(req.query.limit, 20, 1, 50);
  const filter = isUnassigned(actor) ? {} : { universityId: { $in: [String(actor.universityId), GLOBAL] } };
  const [total, rows] = await Promise.all([
    FinancialOpportunity.countDocuments(filter),
    FinancialOpportunity.find(filter).sort({ createdAt: -1 }).skip((p - 1) * l).limit(l),
  ]);
  const names = await universityNames(rows);
  res.json({
    status: "success",
    data: rows.map((o) => ({ ...view(o, names), expired: !!o.deadline && o.deadline < new Date() })),
    pagination: page(total, p, l),
  });
});

exports.remove = adminWrap(async (req, res, actor) => {
  if (!isId(req.params.id)) return fail(res, 404, "Listing not found.");
  const o = await FinancialOpportunity.findById(req.params.id);
  const allowed = o && (o.universityId === GLOBAL ? isUnassigned(actor) || o.postedBy === actor.id : inScope(actor, o.universityId));
  if (!o || !allowed) return fail(res, 404, "Listing not found.");
  await o.deleteOne();
  await audit(actor, "OPPORTUNITY_DELETE", o._id, { title: o.title });
  res.json({ status: "success", message: "Listing deleted." });
});

// ---------- everyone signed in ----------
exports.listForStudents = async (req, res) => {
  try {
    const me = await User.findById(req.user.id).select("universityId");
    const p = clampInt(req.query.page, 1, 1, 100000);
    const l = clampInt(req.query.limit, 20, 1, 50);
    const filter = {
      universityId: { $in: [me?.universityId ? String(me.universityId) : null, GLOBAL].filter(Boolean) },
      $or: [{ deadline: null }, { deadline: { $gte: new Date() } }],
    };
    if (typeof req.query.type === "string" && TYPES.includes(req.query.type)) filter.type = req.query.type;
    const [total, rows] = await Promise.all([
      FinancialOpportunity.countDocuments(filter),
      FinancialOpportunity.find(filter).sort({ createdAt: -1 }).skip((p - 1) * l).limit(l),
    ]);
    const names = await universityNames(rows);
    res.json({ status: "success", data: rows.map((o) => view(o, names)), pagination: page(total, p, l) });
  } catch (error) {
    console.error("[opportunities] list:", error);
    fail(res, 500, "Could not load listings.");
  }
};
