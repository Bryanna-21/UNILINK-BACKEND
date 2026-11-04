"use strict";

const mongoose = require("mongoose");
const { evaluateRoleChange } = require("../utils/roleChange.rules");

// PATCH /api/admin/users/:id/role   body: { role: "lecturer" | "admin" | "student", reason? }
//
// The rules live in utils/roleChange.rules.js. This handler loads both people fresh from the
// database (never trusts the role in the token), applies the change in one conditional update,
// signs the person out everywhere (their saved login carries the old role), tells them, and
// writes the audit trail.
function createChangeUserRole({ User, AuditLog, notify, log = console }) {
  return async function changeUserRole(req, res) {
    try {
      const { id } = req.params;
      const newRole = typeof req.body?.role === "string" ? req.body.role.trim().toLowerCase() : "";
      const reason = typeof req.body?.reason === "string" ? req.body.reason.trim().slice(0, 300) : "";

      if (!mongoose.isValidObjectId(id)) {
        return res.status(400).json({ status: "error", message: "Invalid user id." });
      }

      const [actor, target] = await Promise.all([
        User.findById(req.user.id).select("role universityId email"),
        User.findById(id).select("name email role status universityId deletedAt removedAt"),
      ]);
      if (!actor) {
        return res.status(401).json({ status: "error", message: "Session expired. Please login again." });
      }

      const verdict = evaluateRoleChange({
        actor: { id: String(actor._id), role: actor.role, universityId: actor.universityId },
        target: target && {
          id: String(target._id),
          role: target.role,
          status: target.status,
          universityId: target.universityId,
          deletedAt: target.deletedAt,
          removedAt: target.removedAt,
        },
        newRole,
      });
      if (!verdict.ok) {
        return res.status(verdict.status).json({ status: "error", code: verdict.code, message: verdict.message });
      }
      if (verdict.noop) {
        return res.status(200).json({
          status: "success",
          message: verdict.message,
          data: { id: String(target._id), role: target.role },
        });
      }

      // Conditional on the role we just read, so two admins acting together cannot both win.
      const updated = await User.findOneAndUpdate(
        { _id: target._id, role: verdict.from },
        { $set: { role: verdict.to }, $inc: { tokenVersion: 1 } },
        { new: true }
      ).select("name email role universityId");
      if (!updated) {
        return res.status(409).json({
          status: "error",
          code: "CHANGED",
          message: "This person's role was changed by someone else just now. Refresh and try again.",
        });
      }

      try {
        await AuditLog.create({
          adminId: String(actor._id),
          adminEmail: actor.email || req.user.email || "unknown",
          action: "USER_ROLE_CHANGE",
          targetType: "User",
          targetId: String(target._id),
          result: "success",
          reason: reason || undefined,
          previousState: { role: verdict.from },
          resultingState: { role: verdict.to },
          details: JSON.stringify({ email: target.email, from: verdict.from, to: verdict.to }),
        });
      } catch (error) {
        log.error("✗ Role change audit entry failed:", error && error.message);
      }

      // Not awaited and never allowed to fail the change.
      Promise.resolve(
        notify({
          recipientIds: [String(target._id)],
          type: "announcement",
          title: `Your UniLink role is now ${verdict.to}`,
          message: "Sign in again to see your new tools.",
          link: "",
        })
      ).catch(() => {});

      return res.status(200).json({
        status: "success",
        message: `${updated.name || "This person"} is now ${verdict.to === "admin" ? "an admin" : verdict.to === "lecturer" ? "a lecturer" : "a student"}. They will need to sign in again.`,
        data: { id: String(updated._id), role: updated.role },
      });
    } catch (error) {
      log.error("✗ Role change failed:", error && error.message);
      return res.status(500).json({ status: "error", message: "Could not change the role. Please try again." });
    }
  };
}

let handler = null;
function real(req, res) {
  if (!handler) {
    handler = createChangeUserRole({
      User: require("../models/User"),
      AuditLog: require("../models/AuditLog"),
      notify: require("../middleware/notifyUsers.middleware"),
    });
  }
  return handler(req, res);
}

module.exports = { createChangeUserRole, changeUserRole: real };
