const mongoose = require("mongoose");

// Records administrative actions for the Audit Logs page. Written by
// logAdminAction (src/middleware/auditLog.middleware.js) whenever an
// admin performs a state-changing action (suspend user, verify
// university, etc). Read-only from the API surface — nothing exposes
// an update/delete for these on purpose (see admin.routes.js).
const auditLogSchema = new mongoose.Schema({
  adminId: { type: String, required: true },
  adminEmail: { type: String, required: true },
  action: { type: String, required: true }, // e.g. "suspend_user", "verify_university"
  targetType: { type: String, required: true }, // e.g. "User", "University"
  targetId: { type: String, required: true },
  result: { type: String, enum: ["success", "failure"], default: "success" },
  details: { type: String },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("AuditLog", auditLogSchema);
