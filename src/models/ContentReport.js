const mongoose = require("mongoose");
const R = require("../utils/moderation.rules");

// A user's report about ANY user-generated object (profile, post, comment, video, message,
// community, event, upload or academic resource). One model for all of them: the content
// itself stays in its own collection, and the (entityType, entityId) pair points at it.
//
// Privacy: `reporterId` is stored for abuse handling and follow-up, but must never be
// returned to the reported person, and is shown to moderators only where the API allows.
// `evidence.snapshot` is a copy of what was reported at the moment of the report, so the
// evidence survives even if the content is later edited or deleted.
const reportEventSchema = new mongoose.Schema(
  {
    at: { type: Date, default: Date.now },
    actorId: { type: String, default: null }, // null = the system (e.g. auto-hide)
    type: { type: String, required: true }, // created | assigned | escalated | status_changed | note | resolved | content_hidden | content_restored | ...
    from: { type: String, default: null },
    to: { type: String, default: null },
    note: { type: String, default: "", maxlength: 1000 },
  },
  { _id: false }
);

const contentReportSchema = new mongoose.Schema({
  reference: { type: String, required: true, unique: true }, // RPT-XXXXXXXX, the reporter's receipt

  reporterId: { type: String, required: true, index: true },

  entityType: { type: String, enum: R.ENTITY_TYPE_IDS, required: true },
  entityId: { type: String, required: true },
  mediaRef: { type: String, default: null }, // for media/video: which attachment of the post
  reportedUserId: { type: String, default: null }, // the owner of the reported object
  universityId: { type: String, default: null }, // scope: which university's moderators see it
  communityId: { type: String, default: null }, // set when the content lives in a community

  category: { type: String, enum: R.CATEGORY_IDS, required: true },
  description: { type: String, default: "", maxlength: R.REPORT_LIMITS.descriptionMax },
  imminent: { type: Boolean, default: false }, // reporter's claim of immediate danger; moderators confirm

  evidence: {
    snapshot: { type: mongoose.Schema.Types.Mixed, default: null },
    capturedAt: { type: Date, default: null },
  },

  severity: { type: String, enum: R.SEVERITIES, required: true },
  severityReason: { type: String, default: "category_default" },
  dueAt: { type: Date, required: true },

  status: { type: String, enum: R.REPORT_STATUSES, default: "open" },
  assignedTo: { type: String, default: null },
  assignedAt: { type: Date, default: null },

  // Reports about an admin/superadmin, and the most sensitive material, are visible only to
  // superadmins so that the person reported (or their colleagues) cannot see them.
  restrictedToSuperadmin: { type: Boolean, default: false },

  escalatedAt: { type: Date, default: null },
  escalatedBy: { type: String, default: null },
  escalationReason: { type: String, default: "" },

  autoHidden: { type: Boolean, default: false }, // content hidden pending review (P0)

  resolution: {
    outcome: { type: String, enum: [...R.RESOLUTION_OUTCOMES, null], default: null },
    note: { type: String, default: "", maxlength: 2000 },
    actionIds: { type: [String], default: [] },
    resolvedBy: { type: String, default: null },
    resolvedAt: { type: Date, default: null },
  },

  events: { type: [reportEventSchema], default: [] },

  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now },
});

contentReportSchema.index({ status: 1, severity: 1, createdAt: 1 }); // the moderation queue
contentReportSchema.index({ universityId: 1, status: 1, severity: 1 });
contentReportSchema.index({ entityType: 1, entityId: 1 });
contentReportSchema.index({ reportedUserId: 1, createdAt: -1 }); // a user's history
contentReportSchema.index({ reporterId: 1, createdAt: -1 }); // throttling and "my reports"

module.exports = mongoose.model("ContentReport", contentReportSchema);
