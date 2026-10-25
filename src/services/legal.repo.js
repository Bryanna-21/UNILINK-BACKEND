"use strict";

// The only legal-feature file that touches mongoose. Thin on purpose: decisions live in legal.core.js.
const mongoose = require("mongoose");
const User = require("../models/User");
const PolicyAcknowledgement = require("../models/PolicyAcknowledgement");

module.exports = {
  async userById(id) {
    if (!mongoose.Types.ObjectId.isValid(id)) return null;
    return User.findById(id).select("_id deletedAt").lean();
  },
  async latestAcknowledgement(userId, policyType) {
    return PolicyAcknowledgement.findOne({ userId, policyType }).sort({ createdAt: -1 }).select("version createdAt").lean();
  },
  async createAcknowledgement({ userId, policyType, version, source }) {
    const row = await PolicyAcknowledgement.create({ userId, policyType, version, source, action: "acknowledged" });
    return { version: row.version, createdAt: row.createdAt };
  },
};
