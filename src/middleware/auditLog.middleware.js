const AuditLog = require("../models/AuditLog");
const User = require("../models/User");

// Not Express middleware in the request-pipeline sense — a small helper
// called explicitly from inside admin controller actions after a
// state-changing operation completes (or fails). Kept in middleware/
// alongside auth.middleware.js and role.middleware.js since it's part
// of the same cross-cutting "admin action" concern.
//
// Usage inside a controller:
//   await logAdminAction(req, { action: "suspend_user", targetType: "User", targetId: id });
//
// Logging failures are swallowed (not thrown) — a broken audit log must
// never be the reason a legitimate admin action fails for the user.
//
// Note: the JWT payload only carries { id, role, universityId } (see
// generateToken in auth.routes.js) — no email. Rather than expand that
// signed payload (which every route using auth.middleware.js relies on),
// we do one extra lookup here so the log records who actually acted.
async function logAdminAction(req, { action, targetType, targetId, result = "success", details }) {
  try {
    const admin = await User.findById(req.user?.id).select("email").lean();

    await AuditLog.create({
      adminId: req.user?.id,
      adminEmail: admin?.email || "unknown",
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

module.exports = logAdminAction;
