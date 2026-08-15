const User = require("../models/User");
const Notification = require("../models/Notification");
const { emitToAdmins } = require("../socket");

// Fans a notification out to every admin user. Called from event sites
// elsewhere in the codebase (see emergency.controller.js and
// university-creation flows) — NOT from admin.controller.js itself,
// since these events originate from student/lecturer-facing actions,
// not admin actions.
//
// Failures are swallowed, same rationale as auditLog.middleware.js: a
// broken notification pipeline must never break the action that
// triggered it (e.g. a student filing an emergency report must succeed
// even if notifying admins fails).
async function notifyAdmins({ type, title, message, link }) {
  try {
    const admins = await User.find({ role: "admin" }).select("_id").lean();
    if (admins.length === 0) return;

    await Notification.insertMany(
      admins.map((admin) => ({
        recipientId: String(admin._id),
        type,
        title,
        message,
        link,
      }))
    );

    // Live push to any admins currently viewing the panel. The REST
    // GET /api/admin/notifications call remains the source of truth
    // (and what a newly-opened tab sees) — this just skips the wait
    // for an admin already connected.
    emitToAdmins("admin-notification", { type, title, message, link, createdAt: new Date().toISOString() });
  } catch (error) {
    console.error("✗ Failed to notify admins:", error.message);
  }
}

module.exports = notifyAdmins;
