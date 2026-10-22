"use strict";

// Loads the facts the access rules need and applies them (utils/postAccess.js decides).
// Dependencies are injected so this is unit-tested without a database; the bottom of the file wires
// the real models.
const { decidePostAccess, decideUserAccess, isPlatformModerator } = require("../utils/postAccess");

function createPostAccess({ User, Community, CommunityMembership, Block }) {
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

  async function canViewPost(viewerId, post) {
    const viewer = await loadViewer(viewerId);
    if (!viewer || !post) return false;
    if (isPlatformModerator(viewer) || String(post.userId) === viewer.id) return decidePostAccess({ viewer, post }).ok;
    const [blocked, communityAccess] = await Promise.all([
      isBlockedEitherWay(viewer.id, post.userId),
      post.communityId ? isCommunityMember(viewer, post.communityId) : Promise.resolve(false),
    ]);
    return decidePostAccess({ viewer, post, communityAccess, blocked }).ok;
  }

  async function canViewUser(viewerId, targetId, { scopeUniversity = true } = {}) {
    const [viewer, target] = await Promise.all([loadViewer(viewerId), loadViewer(targetId)]);
    if (!viewer || !target) return false;
    const blocked = isPlatformModerator(viewer) ? false : await isBlockedEitherWay(viewer.id, target.id);
    return decideUserAccess({ viewer, target, blocked, scopeUniversity }).ok;
  }

  return { loadViewer, isBlockedEitherWay, blockedIdsFor, canViewPost, canViewUser };
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
};
