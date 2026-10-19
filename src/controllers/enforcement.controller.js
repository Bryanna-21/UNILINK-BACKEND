"use strict";

// HTTP layer for penalties and appeals. Thin on purpose: the rules live in
// utils/enforcement.rules.js and the logic in services/enforcement.service.js, both tested
// without a database.
const User = require("../models/User");
const { SafetyError } = require("../services/moderation.service");
const service = require("../services/enforcement.instance");

// The moderator's role and university are read fresh from the database, never trusted from the
// token: a demoted or reassigned admin loses their powers immediately.
async function loadActor(req) {
  const u = await User.findById(req.user.id).select("role universityId email status");
  if (!u) return null;
  return { id: String(u._id), role: u.role, universityId: u.universityId || null, email: u.email };
}

function handler(fn, { successStatus = 200, staffOnly = true } = {}) {
  return async (req, res) => {
    try {
      let actor = null;
      if (staffOnly) {
        actor = await loadActor(req);
        if (!actor || !["admin", "superadmin"].includes(actor.role)) {
          return res.status(403).json({ status: "error", message: "Admins only." });
        }
      }
      const result = await fn(req, actor);
      const body = result && result.data !== undefined && result.pagination ? { status: "success", ...result } : { status: "success", data: result };
      return res.status(successStatus).json(body);
    } catch (err) {
      if (err instanceof SafetyError) return res.status(err.status).json({ status: "error", code: err.code, message: err.message });
      console.error(`[enforcement] ${req.method} ${req.originalUrl}:`, err);
      return res.status(500).json({ status: "error", message: "Something went wrong. Please try again." });
    }
  };
}

// Moderators
exports.impose = handler((req, actor) => service.imposeAction({ actor, reportId: req.params.id, body: req.body }), { successStatus: 201 });
exports.listActions = handler((req, actor) => service.listActions({ actor, query: req.query }));
exports.getAction = handler((req, actor) => service.getAction({ actor, actionId: req.params.id }));
exports.approve = handler((req, actor) => service.decideTermination({ actor, actionId: req.params.id, approve: true, note: req.body && req.body.note }));
exports.reject = handler((req, actor) => service.decideTermination({ actor, actionId: req.params.id, approve: false, note: req.body && req.body.note }));
exports.revoke = handler((req, actor) => service.revokeAction({ actor, actionId: req.params.id, reason: req.body && req.body.reason }));
exports.listAppeals = handler((req, actor) => service.listAppeals({ actor, query: req.query }));
exports.getAppeal = handler((req, actor) => service.getAppeal({ actor, appealId: req.params.id }));
exports.decideAppeal = handler((req, actor) => service.decideAppeal({ actor, appealId: req.params.id, body: req.body }));

// The person who was penalised (reachable while suspended or terminated: see the route)
exports.submitAppeal = handler(
  (req) => service.submitAppeal({ userId: req.user.id, actionId: req.params.actionId, statement: req.body && req.body.statement }),
  { successStatus: 201, staffOnly: false }
);
