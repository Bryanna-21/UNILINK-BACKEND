const AuditLog = require("../models/AuditLog");
const User = require("../models/User");

// Generalized version of logAdminAction (see auditLog.middleware.js)
// for actions performed by any role, not just admins - students
// creating emergency reports, lecturers acknowledging/responding to
// them, admins resolving them, etc. Reuses the same AuditLog model
// (its fields are generic enough for any actor) but does NOT reuse
// logAdminAction itself, since that function and its field names
// (adminId, adminEmail) are specifically shaped for admin-performed
// actions and would be misleading applied to a student or lecturer.
//
// Same swallow-on-failure rationale as logAdminAction: a broken audit
// log must never be the reason a legitimate action fails for the user.
async function logAction(req, { action, targetType, targetId, result = "success", details }) {
  try {
    const actor = await User.findById(req.user?.id).select("email").lean();
    await AuditLog.create({
      adminId: req.user?.id,
      adminEmail: actor?.email || "unknown",
      action,
      targetType,
      targetId: String(targetId),
      result,
      details,
    });
  } catch (error) {
    console.error("✗ Failed to write audit log:", error.message);
  }
}

module.exports = logAction;
