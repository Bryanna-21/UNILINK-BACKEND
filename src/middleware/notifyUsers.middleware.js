const UserNotification = require("../models/UserNotification");
const User = require("../models/User");
const { sendPushNotification } = require("../utils/push.util");

// Generic per-user notification creator, mirroring
// notifyAdmins.middleware.js's shape but for arbitrary
// students/lecturers rather than the admin pool. Called explicitly
// from inside controllers after a state-changing action completes
// (grading, posting an assignment, sending a message, publishing an
// exam) - not Express middleware in the request-pipeline sense,
// same convention as notifyAdmins.
//
// Accepts either a single recipientId or an array, since some events
// notify one person (a message) and others notify many at once (a
// new assignment posted to every enrolled student).
//
// Failures are swallowed, same rationale as notifyAdmins and
// auditLog: a broken notification pipeline must never be the reason
// a legitimate action fails for the user who triggered it.
async function notifyUsers({ recipientIds, type, title, message, link, context = {} }) {
  try {
    const ids = Array.isArray(recipientIds) ? recipientIds : [recipientIds];
    const uniqueIds = [...new Set(ids.filter(Boolean))];
    if (uniqueIds.length === 0) return;

    await UserNotification.insertMany(
      uniqueIds.map((recipientId) => ({
        recipientId,
        type,
        title,
        message,
        link,
        courseId: context.courseId || null,
        conversationId: context.conversationId || null,
        assignmentId: context.assignmentId || null,
        examId: context.examId || null,
      }))
    );

    // Real OS-level push, in addition to the in-app UserNotification
    // rows above. The in-app record is the source of truth (what
    // MyNotifications.js reads) - push is purely a best-effort nudge
    // so a recipient finds out without having the app open. A
    // recipient with no pushToken registered simply gets no push,
    // silently (see push.util.js's own skip-on-null-token behavior).
    const recipients = await User.find({ _id: { $in: uniqueIds } }).select("pushToken");
    recipients.forEach((r) => {
      if (r.pushToken) sendPushNotification(r.pushToken, { title, body: message, data: { type, link } });
    });
  } catch (error) {
    console.error("✗ Failed to notify user(s):", error.message);
  }
}

module.exports = notifyUsers;
