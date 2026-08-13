const mongoose = require("mongoose");

// Admin-facing notifications only. This is intentionally NOT a
// general-purpose notification system for the whole app (students,
// lecturers, etc. have no notification model or delivery path here) —
// that would be a much larger feature spanning push delivery, user
// preferences, and read receipts across every role. This model exists
// to surface admin-relevant events inside the Admin Panel:
//   - a new EmergencyReport is filed (see admin.controller.js callers)
//   - a new University is registered and awaiting verification
// New event types can be added by creating a Notification wherever that
// event already happens in the codebase (see notifyAdmins helper below).
const notificationSchema = new mongoose.Schema({
  recipientId: { type: String, required: true }, // admin user's _id
  type: { type: String, required: true }, // e.g. "new_emergency_report", "new_university"
  title: { type: String, required: true },
  message: { type: String },
  link: { type: String }, // relative admin panel path, e.g. "/reports"
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Notification", notificationSchema);
