const mongoose = require("mongoose");

// Append-only evidence that a person was shown a specific version of a legal notice and confirmed they had read it.
// Rows are never edited or deleted by the app, so the history of versions a person acknowledged is preserved.
//
// This is an ACKNOWLEDGEMENT of a notice, not consent. Consent for any optional processing is a separate record
// (it would carry its own purpose and a withdrawal action). Nothing sensitive is copied here: no IP address, no device
// details, only who, which notice, which version, from where, and when.
const policyAcknowledgementSchema = new mongoose.Schema(
  {
    userId: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    policyType: { type: String, enum: ["privacy"], required: true },
    version: { type: String, required: true },
    action: { type: String, enum: ["acknowledged"], default: "acknowledged" },
    source: { type: String, enum: ["web", "mobile", "unknown"], default: "unknown" },
  },
  { timestamps: { createdAt: true, updatedAt: false } }
);

policyAcknowledgementSchema.index({ userId: 1, policyType: 1, createdAt: -1 });

module.exports = mongoose.model("PolicyAcknowledgement", policyAcknowledgementSchema);
