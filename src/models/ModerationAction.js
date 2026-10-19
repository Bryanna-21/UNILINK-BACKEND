const mongoose = require("mongoose");
const R = require("../utils/moderation.rules");

// One enforcement decision against a user: a warning, a content removal, a feature
// restriction, a suspension or a termination. Kept as its own record (not just a status flag
// on User) so that there is always a history, a stated reason, and something to APPEAL.
const moderationActionSchema = new mongoose.Schema({
  userId: { type: String, required: true, index: true }, // who it was imposed on
  actionType: { type: String, enum: R.ENFORCEMENT_ACTIONS, required: true },
  reason: { type: String, required: true, maxlength: 2000 }, // shown to the user
  policySection: { type: String, default: null }, // Community Standards section id
  reportId: { type: String, default: null },
  moderatorId: { type: String, required: true }, // who imposed it (never the appeal reviewer)

  entity: {
    type: { type: String, default: null },
    id: { type: String, default: null },
  },
  feature: { type: String, enum: [...R.RESTRICTABLE_FEATURES, null], default: null },

  startsAt: { type: Date, default: Date.now },
  expiresAt: { type: Date, default: null }, // null = until lifted (or permanent)

  status: { type: String, enum: ["active", "expired", "revoked", "overturned", "pending_approval", "rejected"], default: "active" },

  // Account closure needs a second moderator: it waits as "pending_approval" until then.
  pendingExpiresAt: { type: Date, default: null }, // a proposal nobody approves lapses at this time
  approvedBy: { type: String, default: null },
  approvedAt: { type: Date, default: null },
  rejectedBy: { type: String, default: null },
  rejectedAt: { type: Date, default: null },
  rejectionNote: { type: String, default: "", maxlength: 1000 },
  revokedBy: { type: String, default: null },
  revokedAt: { type: Date, default: null },
  revokedReason: { type: String, default: "", maxlength: 1000 },
  reducedFrom: { type: String, default: null }, // "permanent_termination" when an appeal softened it

  // Copied from the report so moderators and appeal reviewers are scoped like the report was.
  universityId: { type: String, default: null },
  restrictedToSuperadmin: { type: Boolean, default: false },
  // A copy of what was reported: the content may be deleted or edited later, and an appeal needs it.
  evidence: { type: mongoose.Schema.Types.Mixed, default: null },

  // Exactly what changed, for the audit trail and for undoing it.
  previousState: { type: mongoose.Schema.Types.Mixed, default: null },
  resultingState: { type: mongoose.Schema.Types.Mixed, default: null },

  createdAt: { type: Date, default: Date.now },
});

moderationActionSchema.index({ userId: 1, createdAt: -1 });
moderationActionSchema.index({ reportId: 1 });
moderationActionSchema.index({ status: 1, createdAt: -1 }); // the closures queue and the sweep

module.exports = mongoose.model("ModerationAction", moderationActionSchema);
