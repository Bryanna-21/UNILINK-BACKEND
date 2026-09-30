const mongoose = require("mongoose");
const Community = require("../models/Community");
const CommunityMembership = require("../models/CommunityMembership");
const User = require("../models/User");

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);
const Post = require("../models/Post");

// Returns every community the requester should see: their own
// university's university-wide community (always first, always
// present, membership computed not stored) plus every other
// community type they're an active CommunityMembership member of.
// Superadmin sees every community across every university — same
// platform-wide exception already applied to Club/Announcement/Post.
exports.getCommunities = async (req, res) => {
  try {
    const requester = await User.findById(req.user.id).select("universityId role");
    const isSuperadmin = requester?.role === "superadmin";

    const communityFilter = isSuperadmin ? {} : { universityId: requester?.universityId };
    const allCommunities = await Community.find(communityFilter).sort({ type: 1, name: 1 }).lean();

    // Real memberships (never exist for type: 'university-wide')
    const memberships = await CommunityMembership.find({
      userId: req.user.id,
      status: "active",
    }).lean();
    const memberCommunityIds = new Set(memberships.map((m) => m.communityId));
    const membershipByCommunityId = new Map(memberships.map((m) => [m.communityId, m]));

    const result = allCommunities
      .map((c) => {
        const isUniversityWide = c.type === "university-wide";
        // Computed membership for university-wide: true if this
        // community's universityId matches the requester's own —
        // never checked against the CommunityMembership collection.
        const isMember = isUniversityWide
          ? c.universityId === requester?.universityId || isSuperadmin
          : memberCommunityIds.has(String(c._id));

        return {
          ...c,
          isMember,
          role: membershipByCommunityId.get(String(c._id))?.role || (isUniversityWide && isMember ? "member" : null),
        };
      })
      // Non-superadmin users only see communities they're a member
      // of, PLUS every public community (for discovery/join). A
      // private, non-joined community stays invisible, same
      // visibility principle as everything else scoped tonight.
      .filter((c) => isSuperadmin || c.isMember || c.isPublic);

    res.status(200).json({ status: "success", count: result.length, data: result });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching communities: " + error.message });
  }
};

// Any verified student/lecturer can create a non-university-wide
// community (per Bryanna's decision: student-created, not
// staff/admin-gated). type 'university-wide' can NEVER be created
// through this endpoint — that type is exclusively system-created,
// see createUniversity's hook in admin.controller.js.
exports.createCommunity = async (req, res) => {
  try {
    const { name, type, description, isPublic, linkedClubId, linkedCourseId } = req.body;

    if (!name || !name.trim()) {
      return res.status(400).json({ status: "error", message: "name is required" });
    }
    const allowedTypes = ["department", "course", "club", "interest"];
    if (!type || !allowedTypes.includes(type)) {
      return res.status(400).json({
        status: "error",
        message: `type must be one of: ${allowedTypes.join(", ")}`,
      });
    }

    const requester = await User.findById(req.user.id).select("universityId");
    if (!requester?.universityId) {
      return res.status(400).json({ status: "error", message: "Your account has no university on file" });
    }

    let community;
    try {
      community = await Community.create({
        universityId: requester.universityId,
        name: name.trim(),
        type,
        description,
        isPublic: isPublic !== false,
        linkedClubId: linkedClubId || null,
        linkedCourseId: linkedCourseId || null,
        createdBy: req.user.id,
      });
    } catch (err) {
      // Duplicate-name collision (unique index on universityId+name,
      // case-insensitive) — a friendlier message than the raw Mongo
      // duplicate-key error.
      if (err.code === 11000) {
        return res.status(409).json({
          status: "error",
          message: "A community with this name already exists at your university",
        });
      }
      throw err;
    }

    // Creator becomes the owner immediately — a community with zero
    // members including its creator makes no sense, same reasoning
    // already used for standalone Conversation groups.
    await CommunityMembership.create({
      communityId: community._id.toString(),
      userId: req.user.id,
      role: "owner",
      status: "active",
    });

    res.status(201).json({ status: "success", data: community });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error creating community: " + error.message });
  }
};

// Self-join for any PUBLIC, non-university-wide community. Private
// communities would need a request-to-join flow (status: 'pending')
// — not built in this pass; isPublic: false communities currently
// have no join path at all, by design, until that flow exists.
exports.joinCommunity = async (req, res) => {
  try {
    if (!isValidId(req.params.communityId)) {
      return res.status(400).json({ status: "error", message: "Invalid community id" });
    }
    const community = await Community.findById(req.params.communityId);
    if (!community) {
      return res.status(404).json({ status: "error", message: "Community not found" });
    }
    if (community.type === "university-wide") {
      return res.status(400).json({
        status: "error",
        message: "University-wide membership is automatic and cannot be joined or left",
      });
    }
    if (!community.isPublic) {
      return res.status(403).json({
        status: "error",
        message: "This community is private. Request-to-join is not yet available.",
      });
    }

    const requester = await User.findById(req.user.id).select("universityId");
    // Cross-university join only allowed if this specific community
    // has explicitly listed the requester's university as connected
    // — otherwise, must match the community's own universityId.
    const isOwnUniversity = community.universityId === requester?.universityId;
    const isConnectedUniversity = community.connectedUniversityIds.includes(requester?.universityId);
    if (!isOwnUniversity && !isConnectedUniversity) {
      return res.status(403).json({
        status: "error",
        message: "This community is not open to your university",
      });
    }

    const existing = await CommunityMembership.findOne({
      communityId: req.params.communityId,
      userId: req.user.id,
    });
    if (existing) {
      if (existing.status === "banned") {
        return res.status(403).json({ status: "error", message: "You have been banned from this community" });
      }
      return res.status(200).json({ status: "success", data: existing });
    }

    const membership = await CommunityMembership.create({
      communityId: req.params.communityId,
      userId: req.user.id,
      role: "member",
      status: "active",
    });
    res.status(201).json({ status: "success", data: membership });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error joining community: " + error.message });
  }
};

exports.leaveCommunity = async (req, res) => {
  try {
    if (!isValidId(req.params.communityId)) {
      return res.status(400).json({ status: "error", message: "Invalid community id" });
    }
    const community = await Community.findById(req.params.communityId);
    if (!community) {
      return res.status(404).json({ status: "error", message: "Community not found" });
    }
    if (community.type === "university-wide") {
      return res.status(400).json({
        status: "error",
        message: "University-wide membership is automatic and cannot be joined or left",
      });
    }

    const membership = await CommunityMembership.findOne({
      communityId: req.params.communityId,
      userId: req.user.id,
    });
    if (membership?.role === "owner") {
      // Deliberately blocked, not silently allowed — an ownerless
      // community with active members and no moderation path is a
      // real problem. Ownership transfer is a real, separate feature
      // not built in this pass.
      return res.status(400).json({
        status: "error",
        message: "As the owner, you cannot leave. Transfer ownership first (not yet available) or delete the community.",
      });
    }

    await CommunityMembership.deleteOne({ communityId: req.params.communityId, userId: req.user.id });
    res.status(200).json({ status: "success", message: "Left community" });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error leaving community: " + error.message });
  }
};


// Checks active membership — university-wide communities have no
// stored membership, so a matching universityId is treated as
// membership for posting purposes too, same computed-not-stored rule
// used everywhere else for this community type.
async function isActiveMember(communityId, userId) {
  const community = await Community.findById(communityId);
  if (!community) return false;
  if (community.type === "university-wide") {
    const user = await User.findById(userId).select("universityId");
    return user?.universityId === community.universityId;
  }
  const membership = await CommunityMembership.findOne({ communityId, userId, status: "active" });
  return !!membership;
}

exports.getCommunityFeed = async (req, res) => {
  try {
    if (!isValidId(req.params.communityId)) {
      return res.status(400).json({ status: "error", message: "Invalid community id" });
    }
    const isMember = await isActiveMember(req.params.communityId, req.user.id);
    if (!isMember) {
      return res.status(403).json({ status: "error", message: "Join this community to see its feed" });
    }

    const posts = await Post.find({ communityId: req.params.communityId })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    res.status(200).json({ status: "success", count: posts.length, data: posts });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching community feed: " + error.message });
  }
};

// Deliberately separate from post.controller.js's createPost —
// requires active membership (checked here, not just "logged in"),
// so a student can't post into a community by guessing its id
// without having joined it first. Does not support media upload in
// this pass — text-only, matching the scope of tonight's build.
exports.createCommunityPost = async (req, res) => {
  try {
    if (!isValidId(req.params.communityId)) {
      return res.status(400).json({ status: "error", message: "Invalid community id" });
    }
    const isMember = await isActiveMember(req.params.communityId, req.user.id);
    if (!isMember) {
      return res.status(403).json({ status: "error", message: "Join this community before posting" });
    }

    const title = typeof req.body.title === "string" ? req.body.title.trim() : "";
    const content = typeof req.body.content === "string" ? req.body.content.trim() : "";
    if (!title || title.length < 5) {
      return res.status(400).json({ status: "error", message: "Post title is required (min. 5 characters)" });
    }
    if (!content || content.length < 10) {
      return res.status(400).json({ status: "error", message: "Post content is required (min. 10 characters)" });
    }

    const community = await Community.findById(req.params.communityId);
    const post = await Post.create({
      userId: req.user.id,
      universityId: community.universityId,
      communityId: req.params.communityId,
      title,
      content,
    });

    res.status(201).json({ status: "success", data: post });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error creating community post: " + error.message });
  }
};
