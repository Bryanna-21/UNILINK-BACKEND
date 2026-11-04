const User = require("../models/User");
const Notification = require("../models/Notification");
const { emitToAdmins, emitToUsers } = require("../socket");
const { sendPushNotification } = require("../utils/push.util");

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
//
// universityId (optional): only the admins of that university, and platform admins (no university),
// are told, and the live message goes only to them. Without it, every admin is told, as before.
// push: false skips the phone push (the emergency alert sends its own, louder one).
async function notifyAdmins({ type, title, message, link, universityId, push = true }) {
  try {
    const scoped = universityId
      ? { $or: [{ universityId: String(universityId) }, { universityId: null }, { universityId: "" }, { universityId: { $exists: false } }] }
      : {};
    const admins = await User.find({ role: "admin", ...scoped }).select("_id pushToken").lean();
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
    const live = { type, title, message, link, createdAt: new Date().toISOString() };
    if (universityId) emitToUsers(admins.map((a) => String(a._id)), "admin-notification", live);
    else emitToAdmins("admin-notification", live);

    // Real OS-level push too, same rationale as notifyUsers.middleware.js.
    admins.forEach((admin) => {
      if (push && admin.pushToken) sendPushNotification(admin.pushToken, { title, body: message, data: { type, link } });
    });
  } catch (error) {
    console.error("✗ Failed to notify admins:", error.message);
  }
}

module.exports = notifyAdmins;
