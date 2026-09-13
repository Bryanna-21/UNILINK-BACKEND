const mongoose = require("mongoose");
const Follow = require("../models/Follow");
const User = require("../models/User");

function getUserId(req) {
  return req.user?.id || req.user?._id || req.user?.userId;
}

// Follows a user. One-directional, instant, no approval step (the
// real Instagram public-account model — confirmed this is what was
// wanted, not a request/accept system). The unique compound index on
// Follow itself is what actually prevents a duplicate follow; the
// try/catch here just turns that into a clean 409 instead of a raw
// Mongo duplicate-key error leaking to the client.
exports.followUser = async (req, res) => {
  try {
    const followerId = getUserId(req);
    const { userId: followingId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(followingId)) {
      return res.status(400).json({ status: "error", message: "Invalid user id" });
    }
    if (String(followerId) === String(followingId)) {
      return res.status(400).json({ status: "error", message: "You cannot follow yourself" });
    }

    const targetUser = await User.findById(followingId).select("_id");
    if (!targetUser) {
      return res.status(404).json({ status: "error", message: "User not found" });
    }

    try {
      await Follow.create({ followerId, followingId });
    } catch (err) {
      if (err.code === 11000) {
        return res.status(409).json({ status: "error", message: "Already following this user" });
      }
      throw err;
    }

    return res.status(201).json({ status: "success", message: "Now following user" });
  } catch (error) {
    console.error("Follow user error:", error);
    return res.status(500).json({ status: "error", message: "Error following user: " + error.message });
  }
};

exports.unfollowUser = async (req, res) => {
  try {
    const followerId = getUserId(req);
    const { userId: followingId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(followingId)) {
      return res.status(400).json({ status: "error", message: "Invalid user id" });
    }

    const result = await Follow.findOneAndDelete({ followerId, followingId });
    if (!result) {
      return res.status(404).json({ status: "error", message: "You are not following this user" });
    }

    return res.status(200).json({ status: "success", message: "Unfollowed user" });
  } catch (error) {
    console.error("Unfollow user error:", error);
    return res.status(500).json({ status: "error", message: "Error unfollowing user: " + error.message });
  }
};

// Everyone who follows :userId. Same manual-join pattern used
// elsewhere in this backend (post.controller.js's attachAuthorNames)
// since Follow stores plain string IDs, not Mongoose refs.
exports.getFollowers = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ status: "error", message: "Invalid user id" });
    }

    const follows = await Follow.find({ followingId: userId }).sort({ createdAt: -1 }).lean();
    const followerIds = follows.map((f) => f.followerId);
    const users = await User.find({ _id: { $in: followerIds } }).select("_id name role").lean();

    return res.status(200).json({ status: "success", count: users.length, data: users });
  } catch (error) {
    console.error("Get followers error:", error);
    return res.status(500).json({ status: "error", message: "Error fetching followers: " + error.message });
  }
};

// Everyone :userId follows.
exports.getFollowing = async (req, res) => {
  try {
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ status: "error", message: "Invalid user id" });
    }

    const follows = await Follow.find({ followerId: userId }).sort({ createdAt: -1 }).lean();
    const followingIds = follows.map((f) => f.followingId);
    const users = await User.find({ _id: { $in: followingIds } }).select("_id name role").lean();

    return res.status(200).json({ status: "success", count: users.length, data: users });
  } catch (error) {
    console.error("Get following error:", error);
    return res.status(500).json({ status: "error", message: "Error fetching following: " + error.message });
  }
};

// Whether the CURRENT authenticated user follows :userId — the
// question a profile screen actually needs answered to decide
// whether to show "Follow" or "Following" on the button. Distinct
// from getFollowers/getFollowing, which are about a target user's
// full lists, not the viewer's own relationship to them.
exports.getFollowStatus = async (req, res) => {
  try {
    const followerId = getUserId(req);
    const { userId: followingId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(followingId)) {
      return res.status(400).json({ status: "error", message: "Invalid user id" });
    }

    const existing = await Follow.findOne({ followerId, followingId }).select("_id").lean();
    return res.status(200).json({ status: "success", data: { isFollowing: !!existing } });
  } catch (error) {
    console.error("Get follow status error:", error);
    return res.status(500).json({ status: "error", message: "Error checking follow status: " + error.message });
  }
};
