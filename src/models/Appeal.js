const mongoose = require("mongoose");
const R = require("../utils/moderation.rules");

// A user's appeal against a ModerationAction. `original` freezes what was decided at the time,
// so the record stays meaningful even if the action is later changed or overturned.
const appealSchema = new mongoose.Schema({
  actionId: { type: String, required: true, unique: true }, // one appeal per action
  userId: { type: String, required: true, index: true },

  original: {
    actionType: { type: String, required: true },
    reason: { type: String, default: "" },
    appliedAt: { type: Date, default: null },
    moderatorId: { type: String, default: null },
  },

  statement: { type: String, required: true, maxlength: 2000 }, // the user's own account

  status: { type: String, enum: R.APPEAL_STATUSES, default: "pending" },
  reviewerId: { type: String, default: null }, // never the moderator who imposed the action
  decision: { type: String, enum: ["upheld", "overturned", "reduced", null], default: null },
  decisionReason: { type: String, default: "", maxlength: 2000 }, // shown to the user

  createdAt: { type: Date, default: Date.now },
  decidedAt: { type: Date, default: null },
});

appealSchema.index({ status: 1, createdAt: 1 }); // the appeals queue

module.exports = mongoose.model("Appeal", appealSchema);
