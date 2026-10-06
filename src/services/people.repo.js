"use strict";

// The only file in the people feature that touches mongoose. Deliberately thin: every
// decision lives in people.core.js, which is unit-tested. This file is syntax-checked
// only until it has run against a real database.

const mongoose = require("mongoose");
const User = require("../models/User");
const Follow = require("../models/Follow");
const Block = require("../models/Block");
const Course = require("../models/Course");
const { escapeRegex } = require("../utils/username.rules");

const PUBLIC = "_id name username role avatarUrl universityId status deletedAt usernameChangedAt createdAt";

// "Someone you can see": not deleted, not suspended or terminated. Legacy documents with no
// status or isVerified field still pass ($nin and $ne match a missing field).
const ACTIVE = {
  deletedAt: null,
  status: { $nin: ["suspended", "terminated"] },
  isVerified: { $ne: false },
};

const s = (x) => String(x);
const validId = (id) => mongoose.Types.ObjectId.isValid(id);

module.exports = {
  async userById(id) {
    if (!validId(id)) return null;
    return User.findById(id).select(PUBLIC).lean();
  },

  async userByUsername(username) {
    return User.findOne({ username }).select(PUBLIC).lean();
  },

  // Returns false when the unique index rejects it (someone else got there first).
  async claimUsername(userId, username, changedAt) {
    const set = { username };
    if (changedAt) set.usernameChangedAt = changedAt;
    try {
      await User.updateOne({ _id: userId }, { $set: set });
      return true;
    } catch (err) {
      if (err && err.code === 11000) return false;
      throw err;
    }
  },

  async releaseUsername(userId) {
    await User.updateOne({ _id: userId }, { $unset: { username: 1 } });
  },

  async searchUsersByUsernamePrefix({ prefix, universityId, excludeIds, limit }) {
    const query = {
      ...ACTIVE,
      username: { $regex: "^" + escapeRegex(prefix) },
      _id: { $nin: excludeIds.filter(validId) },
    };
    if (universityId) query.universityId = universityId;
    return User.find(query).select(PUBLIC).sort({ username: 1 }).limit(limit).lean();
  },

  async usersByIds(ids) {
    const good = ids.filter(validId);
    if (!good.length) return [];
    return User.find({ _id: { $in: good }, ...ACTIVE }).select(PUBLIC).lean();
  },

  async recentUsers({ universityId, excludeIds, limit }) {
    if (limit <= 0) return [];
    return User.find({
      ...ACTIVE,
      universityId,
      username: { $type: "string" },
      _id: { $nin: excludeIds.filter(validId) },
    })
      .select(PUBLIC)
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();
  },

  async followedAmong(userId, ids) {
    if (!ids.length) return new Set();
    const rows = await Follow.find({ followerId: s(userId), followingId: { $in: ids.map(s) } })
      .select("followingId")
      .lean();
    return new Set(rows.map((r) => s(r.followingId)));
  },

  async followingIds(userId, limit) {
    const rows = await Follow.find({ followerId: s(userId) })
      .sort({ createdAt: -1 })
      .limit(limit)
      .select("followingId")
      .lean();
    return rows.map((r) => s(r.followingId));
  },

  async followingOfMany(followerIds, cap) {
    if (!followerIds.length) return [];
    return Follow.find({ followerId: { $in: followerIds.map(s) } })
      .limit(cap)
      .select("followerId followingId")
      .lean();
  },

  async coursesOf(userId) {
    return Course.find({ enrolledStudentIds: s(userId) }).select("enrolledStudentIds").limit(50).lean();
  },

  async blockedIdsFor(userId) {
    const me = s(userId);
    const rows = await Block.find({ $or: [{ blockerId: me }, { blockedId: me }] })
      .select("blockerId blockedId")
      .lean();
    return rows.map((r) => (s(r.blockerId) === me ? s(r.blockedId) : s(r.blockerId)));
  },

  async isBlockedEitherWay(a, b) {
    const found = await Block.exists({
      $or: [
        { blockerId: s(a), blockedId: s(b) },
        { blockerId: s(b), blockedId: s(a) },
      ],
    });
    return !!found;
  },

  async addBlock(blockerId, blockedId) {
    await Block.updateOne(
      { blockerId, blockedId },
      { $setOnInsert: { createdAt: new Date() } },
      { upsert: true }
    );
  },

  async removeBlock(blockerId, blockedId) {
    await Block.deleteOne({ blockerId, blockedId });
  },

  async listBlocks(blockerId) {
    return Block.find({ blockerId }).sort({ createdAt: -1 }).limit(200).lean();
  },

  async removeFollowsBetween(a, b) {
    await Follow.deleteMany({
      $or: [
        { followerId: a, followingId: b },
        { followerId: b, followingId: a },
      ],
    });
  },
};
