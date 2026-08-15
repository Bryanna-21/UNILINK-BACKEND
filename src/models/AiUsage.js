const mongoose = require("mongoose");

// Tracks how many AI requests a user has made on a given calendar day
// (UTC), so the rate limit survives server restarts (Render's free
// tier sleeps and restarts routinely - an in-memory counter would
// reset constantly and the limit would be meaningless).
//
// One document per user per day. dateKey is a plain "YYYY-MM-DD"
// string rather than a Date range query, since it's simpler to
// upsert-and-increment atomically without a race condition.
const aiUsageSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  dateKey: { type: String, required: true }, // "YYYY-MM-DD", UTC
  count: { type: Number, default: 0 },
});

aiUsageSchema.index({ userId: 1, dateKey: 1 }, { unique: true });

module.exports = mongoose.model("AiUsage", aiUsageSchema);
