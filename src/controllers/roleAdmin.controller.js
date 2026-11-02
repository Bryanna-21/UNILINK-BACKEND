"use strict";

// Changing someone's role directly:
//   GET   /api/admin/roles/users?q=&role=   find people to promote or demote (scoped to the caller)
//   PATCH /api/admin/roles/:id              { role, universityId?, platformWide?, department? }
//
// The decision lives in utils/roleChange.rules.js. This file loads fresh facts from the database
// (never the role inside the token, which can be up to 30 days old), applies the decision with a
// guarded update, signs the person out everywhere, and writes the audit entry.
//
// Dependencies are injected so the exact handlers are tested without a database
// (tests/roleAdmin.controller.test.js); the bottom of the file wires the real models.

const { planRoleChange } = require("../utils/roleChange.rules");
const { scopeFilter, escapeRegex } = require("../utils/adminScope");

const LIMIT = 20;

function createRoleAdmin({ User, University, writeAudit, isValidId }) {
  async function loadActor(userId) {
    const a = await User.findById(userId).select("role universityId status").lean();
    if (!a || (a.role !== "admin" && a.role !== "superadmin") || a.status !== "active") return null;
    return { id: String(userId), role: a.role, universityId: a.universityId || null };
  }

  const shape = (u) => ({
    id: String(u._id),
    name: u.name || "",
    email: u.email || "",
    username: u.username || "",
    role: u.role,
    universityId: u.universityId || null,
    department: u.department || "",
    status: u.status || "active",
    isVerified: !!u.isVerified,
  });

  async function searchUsers(req, res) {
    try {
      const actor = await loadActor(req.user.id);
      if (!actor) return res.status(403).json({ status: "error", message: "Admins only." });

      const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 60) : "";
      const roleFilter = ["student", "lecturer", "admin"].includes(req.query.role) ? req.query.role : null;
      // Never dump the whole user base: ask for a name, or for one role.
      if (q.length < 2 && !roleFilter) {
        return res.status(400).json({ status: "error", message: "Type at least 2 letters of a name, email or username." });
      }

      // Admins manage students and lecturers. Only the superadmin sees and changes admins.
      const visible = actor.role === "superadmin" ? ["student", "lecturer", "admin"] : ["student", "lecturer"];
      const roles = roleFilter ? visible.filter((r) => r === roleFilter) : visible;
      if (!roles.length) return res.status(200).json({ status: "success", count: 0, data: [] });

      const filter = { role: { $in: roles }, deletedAt: null, removedAt: null, ...scopeFilter(actor) };
      if (q.length >= 2) {
        const rx = new RegExp(escapeRegex(q), "i");
        filter.$or = [{ name: rx }, { email: rx }, { username: rx }, { admissionNumber: rx }];
      }

      const users = await User.find(filter)
        .select("name email username role universityId department status isVerified")
        .sort({ name: 1 })
        .limit(LIMIT)
        .lean();

      return res.status(200).json({ status: "success", count: users.length, data: users.map(shape) });
    } catch (error) {
      console.error("[roles] search failed:", error.message);
      return res.status(500).json({ status: "error", message: "Could not search users." });
    }
  }

  async function changeRole(req, res) {
    try {
      const { id } = req.params;
      if (!isValidId(id)) return res.status(400).json({ status: "error", message: "Invalid user id." });

      const actor = await loadActor(req.user.id);
      if (!actor) return res.status(403).json({ status: "error", message: "Admins only." });

      const body = req.body || {};
      const universityId = typeof body.universityId === "string" && body.universityId ? body.universityId : null;
      if (universityId && !isValidId(universityId)) {
        return res.status(400).json({ status: "error", message: "Invalid university." });
      }

      const target = await User.findById(id).select("name role universityId status isVerified deletedAt removedAt").lean();
      if (!target) return res.status(404).json({ status: "error", message: "User not found." });

      const plan = planRoleChange({
        actor,
        target: { ...target, id: String(target._id) },
        newRole: body.role,
        universityId,
        platformWide: body.platformWide === true,
        department: body.department,
      });
      if (!plan.ok) return res.status(plan.status).json({ status: "error", message: plan.message });

      if (plan.set.universityId) {
        const exists = await University.exists({ _id: plan.set.universityId });
        if (!exists) return res.status(400).json({ status: "error", message: "That university does not exist." });
      }

      // Guarded: only applies if the role is still what we just read. Two admins acting at once
      // cannot both succeed on stale information.
      const result = await User.updateOne(
        { _id: id, role: target.role, deletedAt: null, removedAt: null },
        { $set: plan.set, $inc: { tokenVersion: 1 } }
      );
      if (!result || result.matchedCount === 0) {
        return res.status(409).json({ status: "error", message: "This account changed while you were working. Search again." });
      }

      await writeAudit(req, {
        action: "change_role",
        targetType: "User",
        targetId: id,
        details: `${plan.from} -> ${plan.to}${plan.set.universityId === null ? " (platform-wide)" : ""}`,
      });

      return res.status(200).json({
        status: "success",
        message: `${target.name || "The user"} is now a ${plan.to}. They are signed out and must sign in again.`,
        data: { id: String(id), from: plan.from, role: plan.to, universityId: "universityId" in plan.set ? plan.set.universityId : target.universityId || null },
      });
    } catch (error) {
      console.error("[roles] change failed:", error.message);
      return res.status(500).json({ status: "error", message: "Could not change the role." });
    }
  }

  return { searchUsers, changeRole };
}

let instance = null;
function real() {
  if (!instance) {
    instance = createRoleAdmin({
      User: require("../models/User"),
      University: require("../models/University"),
      writeAudit: require("../middleware/auditLog.middleware"),
      isValidId: (v) => /^[0-9a-f]{24}$/i.test(String(v)),
    });
  }
  return instance;
}

module.exports = {
  createRoleAdmin,
  searchUsers: (req, res) => real().searchUsers(req, res),
  changeRole: (req, res) => real().changeRole(req, res),
};
