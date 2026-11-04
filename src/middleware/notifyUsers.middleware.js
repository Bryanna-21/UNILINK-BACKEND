const UserNotification = require("../models/UserNotification");
const User = require("../models/User");
const { sendToTokens } = require("../services/push.service");

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
//
// Options beyond the basics:
//   actorId, postId  who did it and which post it is about (follows, likes, comments, mentions)
//   dedupe           notify once per (recipient, type, actor, post): a repeated follow or like
//                    adds no new row and sends no new push
//   inApp: false     push only, no row in the notification list (new messages: they show on the
//                    Messages screen, not in the bell list)
async function notifyUsers({
  recipientIds,
  type,
  title,
  message,
  link,
  context = {},
  actorId = null,
  postId = null,
  dedupe = false,
  inApp = true,
}) {
  try {
    const ids = Array.isArray(recipientIds) ? recipientIds : [recipientIds];
    let uniqueIds = [...new Set(ids.filter(Boolean))];
    if (uniqueIds.length === 0) return;

    const row = (recipientId) => ({
      recipientId,
      type,
      title,
      message,
      link,
      courseId: context.courseId || null,
      conversationId: context.conversationId || null,
      assignmentId: context.assignmentId || null,
      examId: context.examId || null,
      actorId: actorId || null,
      postId: postId || null,
    });

    if (inApp && dedupe) {
      // Only the people this is genuinely new for get the push below.
      const fresh = [];
      for (const recipientId of uniqueIds) {
        // The fields in the filter are inserted by the upsert itself; the rest go in $setOnInsert.
        const { recipientId: _r, type: _t, actorId: _a, postId: _p, ...rest } = row(recipientId);
        const result = await UserNotification.updateOne(
          { recipientId, type, actorId: actorId || null, postId: postId || null },
          { $setOnInsert: { ...rest, read: false, createdAt: new Date() } },
          { upsert: true }
        );
        if (result && result.upsertedCount > 0) fresh.push(recipientId);
      }
      uniqueIds = fresh;
      if (uniqueIds.length === 0) return;
    } else if (inApp) {
      await UserNotification.insertMany(uniqueIds.map(row));
    }

    // Real OS-level push, in addition to the in-app UserNotification
    // rows above. The in-app record is the source of truth (what
    // MyNotifications.js reads) - push is purely a best-effort nudge
    // so a recipient finds out without having the app open. A
    // recipient with no pushToken registered simply gets no push,
    // silently (see push.util.js's own skip-on-null-token behavior).
    const recipients = await User.find({ _id: { $in: uniqueIds } }).select("pushToken");
    // Batched, and never awaited: the person who triggered this must not wait for Expo.
    sendToTokens(recipients.map((r) => r.pushToken), {
      title,
      body: message,
      data: { type, link, ...(context.courseId ? { courseId: context.courseId } : {}) },
    }).catch(() => {});
  } catch (error) {
    console.error("✗ Failed to notify user(s):", error.message);
  }
}

module.exports = notifyUsers;
