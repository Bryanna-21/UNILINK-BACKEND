const mongoose = require("mongoose");

// Per-user notifications for students and lecturers - deliberately
// separate from models/Notification.js, which is explicitly
// admin-only (see its own top-of-file comment) and serves a
// different, narrower purpose (emergency reports, university
// registrations surfaced to admins). This model serves the opposite
// population: everyday students/lecturers being notified about
// things relevant to their own courses, grades, assignments, and
// messages.
//
// type discriminates the event and determines which optional context
// fields are populated - a "new_message" notification has
// conversationId set and courseId/assignmentId null, a
// "grade_posted" notification has courseId set and conversationId
// null, etc. link is always a ready-to-navigate relative frontend
// path so the notification list never needs type-specific routing
// logic.
const userNotificationSchema = new mongoose.Schema({
  recipientId: { type: String, required: true },

  type: {
    type: String,
    enum: [
      "grade_posted",
      "new_assignment",
      "new_message",
      "exam_published",
      "announcement",
      "timetable",
      "opportunity",
      "schedule_change",
      "moderation",
      // Instagram-style activity (see services/activity.notify.js).
      "new_follower",
      "post_like",
      "post_comment",
      "mention",
    ],
    required: true,
  },

  title: { type: String, required: true },
  message: { type: String },
  link: { type: String },

  // Optional context, populated depending on type - see comment
  // above. Never all set at once for a single notification.
  courseId: { type: String, default: null },
  conversationId: { type: String, default: null },
  assignmentId: { type: String, default: null },
  examId: { type: String, default: null },

  // For activity notifications: who did it, and which post it is about.
  actorId: { type: String, default: null },
  postId: { type: String, default: null },

  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

// Every list query filters by recipientId first - this is the one
// index that matters for this model's actual access pattern.
userNotificationSchema.index({ recipientId: 1, createdAt: -1 });
// Lets a repeated follow or like be recognised, so it notifies only once.
userNotificationSchema.index({ recipientId: 1, type: 1, actorId: 1, postId: 1 });

module.exports = mongoose.model("UserNotification", userNotificationSchema);
