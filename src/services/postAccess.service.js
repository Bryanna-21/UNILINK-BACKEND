"use strict";

// Loads the facts the access rules need and applies them (utils/postAccess.js decides).
// Dependencies are injected so this is unit-tested without a database; the bottom of the file wires
// the real models.
const { decidePostAccess, decideUserAccess, isPlatformModerator } = require("../utils/postAccess");
const { needsFollowFacts, audienceFilter } = require("../utils/postAudience");

function createPostAccess({ User, Community, CommunityMembership, Block, Follow }) {
  async function loadViewer(userId) {
    if (!userId) return null;
    const u = await User.findById(userId).select("role universityId deletedAt").lean();
    return u ? { id: String(u._id), role: u.role, universityId: u.universityId || null, deletedAt: u.deletedAt || null } : null;
  }

  // Either direction counts: if A blocked B, neither sees the other.
  async function isBlockedEitherWay(a, b) {
    if (!a || !b || String(a) === String(b)) return false;
    const hit = await Block.findOne({
      $or: [
        { blockerId: String(a), blockedId: String(b) },
        { blockerId: String(b), blockedId: String(a) },
      ],
    }).lean();
    return !!hit;
  }

  async function blockedIdsFor(userId) {
    if (!userId) return [];
    const me = String(userId);
    const rows = await Block.find({ $or: [{ blockerId: me }, { blockedId: me }] }).lean();
    return [...new Set(rows.map((r) => (String(r.blockerId) === me ? String(r.blockedId) : String(r.blockerId))))];
  }

  // Same rule the community feed uses: a university-wide community is open to that university,
  // every other kind needs an active membership.
  async function isCommunityMember(viewer, communityId) {
    const community = await Community.findById(communityId).lean();
    if (!community) return false;
    if (community.type === "university-wide") return !!viewer.universityId && String(viewer.universityId) === String(community.universityId);
    const m = await CommunityMembership.findOne({ communityId: String(communityId), userId: viewer.id, status: "active" }).lean();
    return !!m;
  }

  // Who follows whom, but only for posts whose audience is followers or friends.
  async function followFacts(viewer, post) {
    if (!Follow || post.communityId || !needsFollowFacts(post)) return undefined;
    const [viewerFollowsAuthor, authorFollowsViewer] = await Promise.all([
      Follow.exists({ followerId: viewer.id, followingId: String(post.userId) }),
      post.audience === "friends" ? Follow.exists({ followerId: String(post.userId), followingId: viewer.id }) : Promise.resolve(false),
    ]);
    return { viewerFollowsAuthor: !!viewerFollowsAuthor, authorFollowsViewer: !!authorFollowsViewer };
  }

  async function canViewPost(viewerId, post) {
    const viewer = await loadViewer(viewerId);
    if (!viewer || !post) return false;
    if (isPlatformModerator(viewer) || String(post.userId) === viewer.id) return decidePostAccess({ viewer, post }).ok;
    const [blocked, communityAccess, follows] = await Promise.all([
      isBlockedEitherWay(viewer.id, post.userId),
      post.communityId ? isCommunityMember(viewer, post.communityId) : Promise.resolve(false),
      followFacts(viewer, post),
    ]);
    return decidePostAccess({ viewer, post, communityAccess, blocked, follows }).ok;
  }

  // The same rules as canViewPost, as a database filter for lists. Returns null when there is nothing
  // to restrict (a platform moderator) and false when the viewer does not exist.
  async function visibleFilter(viewerId) {
    const viewer = await loadViewer(viewerId);
    if (!viewer || viewer.deletedAt) return false;
    if (isPlatformModerator(viewer)) return null;
    let followingIds = [];
    let mutualIds = [];
    if (Follow) {
      const rows = await Follow.find({ followerId: viewer.id }).select("followingId").limit(5000).lean();
      followingIds = rows.map((r) => String(r.followingId));
      if (followingIds.length) {
        const back = await Follow.find({ followerId: { $in: followingIds }, followingId: viewer.id }).select("followerId").lean();
        mutualIds = back.map((r) => String(r.followerId));
      }
    }
    return audienceFilter({ viewer, followingIds, mutualIds });
  }

  async function canViewUser(viewerId, targetId, { scopeUniversity = false } = {}) {
    const [viewer, target] = await Promise.all([loadViewer(viewerId), loadViewer(targetId)]);
    if (!viewer || !target) return false;
    const blocked = isPlatformModerator(viewer) ? false : await isBlockedEitherWay(viewer.id, target.id);
    return decideUserAccess({ viewer, target, blocked, scopeUniversity }).ok;
  }

  return { loadViewer, isBlockedEitherWay, blockedIdsFor, canViewPost, canViewUser, visibleFilter };
}

let instance = null;
// Created on first use so requiring this file never touches the models in tests.
function real() {
  if (!instance) {
    instance = createPostAccess({
      User: require("../models/User"),
      Community: require("../models/Community"),
      CommunityMembership: require("../models/CommunityMembership"),
      Block: require("../models/Block"),
      Follow: require("../models/Follow"),
    });
  }
  return instance;
}

module.exports = {
  createPostAccess,
  loadViewer: (...a) => real().loadViewer(...a),
  isBlockedEitherWay: (...a) => real().isBlockedEitherWay(...a),
  blockedIdsFor: (...a) => real().blockedIdsFor(...a),
  canViewPost: (...a) => real().canViewPost(...a),
  canViewUser: (...a) => real().canViewUser(...a),
  visibleFilter: (...a) => real().visibleFilter(...a),
};
