const mongoose = require("mongoose");
const Post = require("../models/Post");
const User = require("../models/User");
const Comment = require("../models/Comment");
const Like = require("../models/Like");
const HiddenPost = require("../models/HiddenPost");
const {
  uploadBufferToCloudinary,
  cloudinary,
} = require("../config/cloudinary");

function getUserId(req) {
  return req.user?.id || req.user?._id || req.user?.userId;
}

function getUserRole(req) {
  return req.user?.role;
}

// Attaches a minimal { name } for each post's author without a
// separate round trip per post - one query for all authors involved,
// keyed by userId. Posts are stored with userId as a plain string
// (not a Mongoose ref), so this is a manual join, not .populate().
async function attachAuthorNames(posts) {
  const userIds = [...new Set(posts.map((p) => String(p.userId)))];
  const users = await User.find({ _id: { $in: userIds } })
    .select("_id name avatarUrl")
    .lean();

  const nameById = new Map(users.map((u) => [String(u._id), u.name]));
  const avatarById = new Map(users.map((u) => [String(u._id), u.avatarUrl || null]));

  return posts.map((p) => ({
    ...p,
    authorName: nameById.get(String(p.userId)) || "Unknown user",
    authorAvatarUrl: avatarById.get(String(p.userId)) || null,
  }));
}

exports.createPost = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        status: "error",
        message: "Authenticated user information is missing",
      });
    }

    const title = typeof req.body.title === "string"
      ? req.body.title.trim()
      : "";

    const content = typeof req.body.content === "string"
      ? req.body.content.trim()
      : "";

    // Title is optional. Content is optional too, as long as there is media: a post needs
    // SOMETHING (text, a photo or a video), not a title.
    const files = req.files || [];

    if (!content && files.length === 0) {
      return res.status(400).json({
        status: "error",
        message: "Add some text, a photo or a video to post.",
      });
    }

    if (title.length > 200) {
      return res.status(400).json({
        status: "error",
        message: "Title must be 200 characters or fewer",
      });
    }

    if (content.length > 5000) {
      return res.status(400).json({
        status: "error",
        message: "Posts can be up to 5000 characters",
      });
    }

    // Uploads are buffered in memory. Keep videos to one per post and
    // documents to one per post so large raw files cannot multiply memory
    // and Cloudinary upload pressure.
    if (files.filter((f) => f.mimetype.startsWith("video/")).length > 1) {
      return res.status(400).json({
        status: "error",
        message: "You can attach one video per post.",
      });
    }

    const documentMimeTypes = new Set([
      "application/pdf",
      "application/msword",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
    ]);

    const documentFiles = files.filter((f) => documentMimeTypes.has(f.mimetype));

    if (documentFiles.length > 1) {
      return res.status(400).json({
        status: "error",
        message: "You can attach one document per post.",
      });
    }

    if (documentFiles.length > 0 && files.length > 1) {
      return res.status(400).json({
        status: "error",
        message: "A document must be posted by itself. Remove the other attachments.",
      });
    }

    let media = [];

    if (files.length > 0) {
      try {
        const uploads = await Promise.all(
          files.map(async (file) => {
            const isDocument = documentMimeTypes.has(file.mimetype);
            const resourceType = isDocument
              ? "raw"
              : file.mimetype.startsWith("video/")
                ? "video"
                : "image";

            const mediaType = isDocument
              ? "document"
              : resourceType;

            const result = await uploadBufferToCloudinary(
              file.buffer,
              "unilink/posts",
              resourceType
            );

            return {
              url: result.secure_url,
              type: mediaType,
              publicId: result.public_id,
            };
          })
        );

        media = uploads;
      } catch (uploadError) {
        console.error(
          "Post media upload failed:",
          uploadError.message
        );

        return res.status(502).json({
          status: "error",
          message:
            "One or more media files failed to upload. Please try again.",
        });
      }
    }

    // universityId looked up fresh from the DB, not trusted from
    // req.user — the JWT payload only carries id/tokenVersion (see
    // auth.middleware.js), so req.user.universityId has always been
    // undefined here. This was silently writing universityId: null
    // on every single post since this field was added.
    const requester = await User.findById(userId).select("universityId");
    const post = await Post.create({
      userId,
      universityId: requester?.universityId || null,
      title,
      content,
      media,
    });

    return res.status(201).json({
      status: "success",
      message: "Post created successfully",
      data: post,
    });
  } catch (error) {
    console.error("Create post error:", error);

    return res.status(500).json({
      status: "error",
      message: "Error creating post: " + error.message,
    });
  }
};

exports.getFeed = async (req, res) => {
  try {
    const userId = getUserId(req);

    // Scoped to the requester's own university — previously this
    // returned every post globally, with no isolation at all, same
    // class of bug already found and fixed in Club/Announcement.
    const requester = await User.findById(userId).select("universityId role");
    const feedFilter = requester?.role === "superadmin" ? {} : { universityId: requester?.universityId };

    // Members-only community posts have their own membership-gated endpoint
    // (community_v2). Without this filter they were listed on everyone's main feed.
    feedFilter.communityId = null;

    // Optional search: ?q= matches post text, title, or the author's name. The text is
    // escaped before it reaches $regex ("(" or ".*" must not crash or hang the server),
    // and queries under 2 characters are ignored.
    const q = typeof req.query.q === "string" ? req.query.q.trim().slice(0, 50) : "";
    if (q.length >= 2) {
      const rx = new RegExp(q.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"), "i");
      const authorFilter = { name: rx, deletedAt: null };
      if (requester?.role !== "superadmin") authorFilter.universityId = requester?.universityId;
      const authors = await User.find(authorFilter).select("_id").limit(100).lean();
      feedFilter.$or = [
        { content: rx },
        { title: rx },
        { userId: { $in: authors.map((a) => String(a._id)) } },
      ];
    }

    const hiddenPosts = await HiddenPost.find({ userId })
      .select("postId")
      .lean();

    const hiddenIds = hiddenPosts
      .map((x) => String(x.postId))
      .filter((id) => mongoose.Types.ObjectId.isValid(id));

    if (hiddenIds.length > 0) {
      feedFilter._id = { $nin: hiddenIds };
    }

    const posts = await Post.find(feedFilter)
      .sort({ score: -1, createdAt: -1 })
      .limit(50)
      .lean();

    const postsWithAuthors = await attachAuthorNames(posts);

    // One query for every post this user has liked among the ones
    // just fetched, not one query per post — same batching principle
    // as attachAuthorNames above, applied to like status instead of
    // author names.
    const postIds = postsWithAuthors.map((p) => String(p._id));
    const userLikes = await Like.find({ userId, postId: { $in: postIds } }).select("postId").lean();
    const likedPostIds = new Set(userLikes.map((l) => l.postId));

    const postsWithLikeStatus = postsWithAuthors.map((p) => ({
      ...p,
      liked: likedPostIds.has(String(p._id)),
    }));

    return res.status(200).json({
      status: "success",
      count: postsWithLikeStatus.length,
      data: postsWithLikeStatus,
    });
  } catch (error) {
    console.error("Get feed error:", error);

    return res.status(500).json({
      status: "error",
      message: "Error fetching feed: " + error.message,
    });
  }
};

// GET /api/posts/user/:userId - a user's main-feed posts, newest first.
// Same university isolation as getFeed. Community posts are excluded
// (communityId: null) because they're visible only to community
// members; listing them on a public profile would leak them.
exports.getPostsByUser = async (req, res) => {
  try {
    const requesterId = getUserId(req);
    const { userId } = req.params;
    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({ status: "error", message: "Invalid user id" });
    }

    const [requester, target] = await Promise.all([
      User.findById(requesterId).select("universityId role"),
      User.findById(userId).select("universityId deletedAt"),
    ]);
    if (!target || target.deletedAt) {
      return res.status(404).json({ status: "error", message: "User not found" });
    }
    if (requester?.role !== "superadmin" && String(target.universityId) !== String(requester?.universityId)) {
      return res.status(404).json({ status: "error", message: "User not found" });
    }

    const posts = await Post.find({
      userId: String(userId),
      communityId: null,
      reshareOf: null,
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const withAuthors = await attachAuthorNames(posts);
    const postIds = withAuthors.map((p) => String(p._id));
    const likes = await Like.find({ userId: requesterId, postId: { $in: postIds } }).select("postId").lean();
    const liked = new Set(likes.map((l) => l.postId));

    return res.status(200).json({
      status: "success",
      count: withAuthors.length,
      data: withAuthors.map((p) => ({ ...p, liked: liked.has(String(p._id)) })),
    });
  } catch (error) {
    console.error("Get posts by user error:", error);
    return res.status(500).json({ status: "error", message: "Error fetching user posts: " + error.message });
  }
};

exports.getPostById = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid post id",
      });
    }

    const post = await Post.findById(id).lean();

    if (!post) {
      return res.status(404).json({
        status: "error",
        message: "Post not found",
      });
    }

    const [postWithAuthor] = await attachAuthorNames([post]);
    const existingLike = await Like.findOne({ userId, postId: id }).select("_id").lean();

    return res.status(200).json({
      status: "success",
      data: { ...postWithAuthor, liked: !!existingLike },
    });
  } catch (error) {
    console.error("Get post error:", error);

    return res.status(500).json({
      status: "error",
      message: "Error fetching post: " + error.message,
    });
  }
};

// Deletion is allowed for the post's original author OR any admin.
// Everyone else gets a 403, same as before - this just adds the
// admin bypass that was previously missing entirely.
exports.deletePost = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);
    const role = getUserRole(req);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid post id",
      });
    }

    const post = await Post.findById(id);

    if (!post) {
      return res.status(404).json({
        status: "error",
        message: "Post not found",
      });
    }

    const isAuthor = String(post.userId) === String(userId);
    const isAdmin = role === "admin";

    if (!isAuthor && !isAdmin) {
      return res.status(403).json({
        status: "error",
        message: "You can only delete your own posts",
      });
    }

    // Delete associated Cloudinary media first.
    if (Array.isArray(post.media) && post.media.length > 0) {
      for (const media of post.media) {
        if (!media.publicId) continue;

        try {
          await cloudinary.uploader.destroy(media.publicId, {
            resource_type:
              media.type === "document"
                ? "raw"
                : media.type === "video"
                  ? "video"
                  : "image",
          });
        } catch (cloudinaryError) {
          console.error(
            `Cloudinary cleanup failed for ${media.publicId}:`,
            cloudinaryError.message
          );
        }
      }
    }

    await post.deleteOne();

    return res.status(200).json({
      status: "success",
      message: "Post deleted successfully",
    });
  } catch (error) {
    console.error("Delete post error:", error);

    return res.status(500).json({
      status: "error",
      message: "Error deleting post: " + error.message,
    });
  }
};

// Real toggle now, not a blind increment. Previously this endpoint
// incremented post.likes on every single call with no per-user
// tracking at all — no way to know if a user had already liked a
// post, no way to unlike, and repeated taps could inflate the count
// indefinitely. Fixed using the same pattern as tonight's Follow
// system: a separate Like join record per (user, post), with a
// compound unique index (on the Like model) preventing a duplicate
// like from ever being created in the first place. This function
// now toggles: if a Like already exists for this user+post, it
// removes it and decrements; otherwise it creates one and increments.
// post.likes remains a denominated counter for fast feed rendering —
// it isn't recomputed by counting Like documents on every read, it's
// kept in sync incrementally on each toggle, same tradeoff Post's own
// commentsCount field already makes for comments.
exports.likePost = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid post id",
      });
    }

    const post = await Post.findById(id);

    if (!post) {
      return res.status(404).json({
        status: "error",
        message: "Post not found",
      });
    }

    const existingLike = await Like.findOne({ userId, postId: id });

    if (existingLike) {
      await Like.deleteOne({ _id: existingLike._id });
      post.likes = Math.max(0, post.likes - 1);
      post.score = Math.max(0, post.score - 2);
      await post.save();
      return res.status(200).json({ status: "success", data: { post, liked: false } });
    }

    try {
      await Like.create({ userId, postId: id });
    } catch (err) {
      // Race condition guard: two rapid taps could both pass the
      // findOne check above before either write lands. The unique
      // index on Like is the real safeguard — if it rejects a
      // duplicate here, treat it as "already liked" rather than a
      // 500, since that's what actually happened.
      if (err.code === 11000) {
        return res.status(409).json({ status: "error", message: "Already liked" });
      }
      throw err;
    }

    post.likes += 1;
    post.score += 2;
    await post.save();

    return res.status(200).json({ status: "success", data: { post, liked: true } });
  } catch (error) {
    console.error("Like post error:", error);

    return res.status(500).json({
      status: "error",
      message: "Error liking post: " + error.message,
    });
  }
};

// Whether the CURRENT authenticated user has liked :id — same shape
// as Follow's getFollowStatus, needed so the feed can render the
// like button's correct initial state (filled heart vs outline)
// rather than always starting from "not liked" regardless of
// history.
exports.getLikeStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const userId = getUserId(req);

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ status: "error", message: "Invalid post id" });
    }

    const existing = await Like.findOne({ userId, postId: id }).select("_id").lean();
    return res.status(200).json({ status: "success", data: { liked: !!existing } });
  } catch (error) {
    console.error("Get like status error:", error);
    return res.status(500).json({ status: "error", message: "Error checking like status: " + error.message });
  }
};

// Comments were previously modeled (Comment.js) but had no routes at
// all — this is new backend work, not a wiring job. Mirrors
// createPost/getFeed's own validation and response style. Reuses the
// same manual-join pattern as attachAuthorNames above rather than a
// separate approach, since comment.userId is the same plain string
// convention as post.userId.
exports.getComments = async (req, res) => {
  try {
    const { id: postId } = req.params;

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ status: "error", message: "Invalid post id" });
    }

    const comments = await Comment.find({ postId }).sort({ createdAt: 1 }).lean();

    const userIds = [...new Set(comments.map((c) => String(c.userId)))];
    const users = await User.find({ _id: { $in: userIds } }).select("_id name avatarUrl").lean();
    const nameById = new Map(users.map((u) => [String(u._id), u.name]));
    const avatarById = new Map(users.map((u) => [String(u._id), u.avatarUrl || null]));

    const withAuthors = comments.map((c) => ({
      ...c,
      authorName: nameById.get(String(c.userId)) || "Unknown user",
      authorAvatarUrl: avatarById.get(String(c.userId)) || null,
    }));

    return res.status(200).json({ status: "success", data: withAuthors });
  } catch (error) {
    console.error("Get comments error:", error);
    return res.status(500).json({ status: "error", message: "Error fetching comments: " + error.message });
  }
};

exports.addComment = async (req, res) => {
  try {
    const { id: postId } = req.params;
    const userId = getUserId(req);

    if (!mongoose.Types.ObjectId.isValid(postId)) {
      return res.status(400).json({ status: "error", message: "Invalid post id" });
    }

    const post = await Post.findById(postId);
    if (!post) {
      return res.status(404).json({ status: "error", message: "Post not found" });
    }

    const content = typeof req.body.content === "string" ? req.body.content.trim() : "";
    if (!content) {
      return res.status(400).json({ status: "error", message: "Comment content is required" });
    }

    const comment = await Comment.create({ postId, userId, content });

    // Kept minimal on purpose: no author name attached to the create
    // response, since the caller already knows their own name — the
    // getComments list above is where authorName actually matters,
    // for everyone else's comments.
    return res.status(201).json({ status: "success", data: comment });
  } catch (error) {
    console.error("Add comment error:", error);
    return res.status(500).json({ status: "error", message: "Error adding comment: " + error.message });
  }
};

/**
 * GET /api/posts/liked
 *
 * Returns posts liked by the authenticated user.
 * Liked posts are private to the authenticated user.
 */
exports.getLikedPosts = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        status: "error",
        message: "Unauthorized",
      });
    }

    const requester = await User.findById(userId)
      .select("universityId role deletedAt")
      .lean();

    if (!requester || requester.deletedAt) {
      return res.status(404).json({
        status: "error",
        message: "User not found",
      });
    }

    const likes = await Like.find({ userId: String(userId) })
      .sort({ createdAt: -1 })
      .limit(100)
      .select("postId createdAt")
      .lean();

    const postIds = likes
      .map((item) => String(item.postId))
      .filter((id) => mongoose.Types.ObjectId.isValid(id));

    if (!postIds.length) {
      return res.status(200).json({
        status: "success",
        count: 0,
        data: [],
      });
    }

    const filter = {
      _id: { $in: postIds },
      communityId: null,
    };

    if (getUserRole(req) !== "superadmin") {
      filter.universityId = requester.universityId;
    }

    const posts = await Post.find(filter).lean();
    const withAuthors = await attachAuthorNames(posts);
    const byId = new Map(
      withAuthors.map((post) => [String(post._id), post])
    );

    const data = postIds
      .map((id) => byId.get(id))
      .filter(Boolean)
      .map((post) => ({
        ...post,
        liked: true,
      }));

    return res.status(200).json({
      status: "success",
      count: data.length,
      data,
    });
  } catch (error) {
    console.error("Get liked posts error:", error);

    return res.status(500).json({
      status: "error",
      message: "Failed to fetch liked posts",
    });
  }
};


/**
 * POST /api/posts/reshare/:id
 *
 * Creates a lightweight Post document representing a reshare.
 * The original post remains the source of truth.
 */
exports.resharePost = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({
        status: "error",
        message: "Unauthorized",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid post id",
      });
    }

    const [requester, original] = await Promise.all([
      User.findById(userId)
        .select("universityId role deletedAt")
        .lean(),
      Post.findById(id).lean(),
    ]);

    if (!requester || requester.deletedAt) {
      return res.status(404).json({
        status: "error",
        message: "User not found",
      });
    }

    if (!original) {
      return res.status(404).json({
        status: "error",
        message: "Post not found",
      });
    }

    if (original.communityId) {
      return res.status(403).json({
        status: "error",
        message: "Community posts cannot be reshared",
      });
    }

    if (
      getUserRole(req) !== "superadmin" &&
      String(original.universityId) !== String(requester.universityId)
    ) {
      return res.status(403).json({
        status: "403",
        message: "You cannot reshare this post",
      });
    }

    if (String(original.userId) === String(userId)) {
      return res.status(400).json({
        status: "error",
        message: "You cannot reshare your own post",
      });
    }

    const existing = await Post.findOne({
      userId: String(userId),
      reshareOf: String(id),
    }).lean();

    if (existing) {
      return res.status(409).json({
        status: "error",
        message: "Post already reshared",
        data: {
          postId: String(id),
          reshared: true,
          reshare: existing,
        },
      });
    }

    const reshare = await Post.create({
      userId: String(userId),
      universityId: requester.universityId || null,
      communityId: null,
      title: "",
      content: "",
      media: [],
      reshareOf: String(id),
    });

    return res.status(201).json({
      status: "success",
      message: "Post reshared successfully",
      data: {
        postId: String(id),
        reshared: true,
        reshare,
      },
    });
  } catch (error) {
    console.error("Reshare post error:", error);

    return res.status(500).json({
      status: "error",
      message: "Failed to reshare post",
    });
  }
};


/**
 * GET /api/posts/user/:userId/reshares
 *
 * Reshares are private to their owner.
 * The returned collection contains the original posts, so the
 * mobile profile can render the real content and navigate to it.
 */
exports.getResharesByUser = async (req, res) => {
  try {
    const requesterId = getUserId(req);
    const { userId } = req.params;

    if (!requesterId) {
      return res.status(401).json({
        status: "error",
        message: "Unauthorized",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(userId)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid user id",
      });
    }

    if (String(requesterId) !== String(userId)) {
      return res.status(403).json({
        status: "error",
        message: "Reshares are private",
      });
    }

    const requester = await User.findById(requesterId)
      .select("universityId role deletedAt")
      .lean();

    if (!requester || requester.deletedAt) {
      return res.status(404).json({
        status: "error",
        message: "User not found",
      });
    }

    const reshares = await Post.find({
      userId: String(userId),
      reshareOf: { $ne: null },
      communityId: null,
    })
      .sort({ createdAt: -1 })
      .limit(50)
      .lean();

    const originalIds = reshares
      .map((item) => String(item.reshareOf))
      .filter((id) => mongoose.Types.ObjectId.isValid(id));

    if (!originalIds.length) {
      return res.status(200).json({
        status: "success",
        count: 0,
        data: [],
      });
    }

    const originalFilter = {
      _id: { $in: originalIds },
      communityId: null,
    };

    if (getUserRole(req) !== "superadmin") {
      originalFilter.universityId = requester.universityId;
    }

    const originals = await Post.find(originalFilter).lean();
    const originalsWithAuthors = await attachAuthorNames(originals);

    const originalMap = new Map(
      originalsWithAuthors.map((post) => [String(post._id), post])
    );

    const data = reshares
      .map((reshare) => originalMap.get(String(reshare.reshareOf)))
      .filter(Boolean)
      .map((post) => ({
        ...post,
        reshared: true,
      }));

    return res.status(200).json({
      status: "success",
      count: data.length,
      data,
    });
  } catch (error) {
    console.error("Get user reshares error:", error);

    return res.status(500).json({
      status: "error",
      message: "Failed to fetch reshares",
    });
  }
};


/**
 * DELETE /api/posts/reshare/:id
 *
 * Here :id is the reshare Post document id.
 */
exports.deleteReshare = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({
        status: "error",
        message: "Unauthorized",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid reshare id",
      });
    }

    const result = await Post.findOneAndDelete({
      _id: id,
      userId: String(userId),
      reshareOf: { $ne: null },
    });

    return res.status(200).json({
      status: "success",
      message: result ? "Reshare removed." : "Reshare was already removed.",
      data: {
        removed: Boolean(result),
      },
    });
  } catch (error) {
    console.error("Delete reshare error:", error);

    return res.status(500).json({
      status: "error",
      message: "Failed to remove reshare",
    });
  }
};


/**
 * POST /api/posts/hidden/:id
 */
exports.hidePost = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({
        status: "error",
        message: "Unauthorized",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid post id",
      });
    }

    const [requester, post] = await Promise.all([
      User.findById(userId)
        .select("universityId role deletedAt")
        .lean(),
      Post.findById(id).select("_id universityId communityId").lean(),
    ]);

    if (!requester || requester.deletedAt) {
      return res.status(404).json({
        status: "error",
        message: "User not found",
      });
    }

    if (!post) {
      return res.status(404).json({
        status: "error",
        message: "Post not found",
      });
    }

    if (post.communityId) {
      return res.status(403).json({
        status: "error",
        message: "Community posts cannot be hidden here",
      });
    }

    if (
      getUserRole(req) !== "superadmin" &&
      String(post.universityId) !== String(requester.universityId)
    ) {
      return res.status(403).json({
        status: "error",
        message: "You cannot hide this post",
      });
    }

    await HiddenPost.updateOne(
      {
        userId: String(userId),
        postId: String(id),
      },
      {
        $setOnInsert: {
          userId: String(userId),
          postId: String(id),
        },
      },
      {
        upsert: true,
      }
    );

    return res.status(200).json({
      status: "success",
      message: "Post hidden.",
      data: {
        postId: String(id),
        hidden: true,
      },
    });
  } catch (error) {
    console.error("Hide post error:", error);

    return res.status(500).json({
      status: "error",
      message: "Failed to hide post",
    });
  }
};


/**
 * DELETE /api/posts/hidden/:id
 */
exports.unhidePost = async (req, res) => {
  try {
    const userId = getUserId(req);
    const { id } = req.params;

    if (!userId) {
      return res.status(401).json({
        status: "error",
        message: "Unauthorized",
      });
    }

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid post id",
      });
    }

    await HiddenPost.deleteOne({
      userId: String(userId),
      postId: String(id),
    });

    return res.status(200).json({
      status: "success",
      message: "Post restored.",
      data: {
        postId: String(id),
        hidden: false,
      },
    });
  } catch (error) {
    console.error("Unhide post error:", error);

    return res.status(500).json({
      status: "error",
      message: "Failed to restore post",
    });
  }
};


/**
 * GET /api/posts/hidden
 */
exports.getHiddenPosts = async (req, res) => {
  try {
    const userId = getUserId(req);

    if (!userId) {
      return res.status(401).json({
        status: "error",
        message: "Unauthorized",
      });
    }

    const requester = await User.findById(userId)
      .select("universityId role deletedAt")
      .lean();

    if (!requester || requester.deletedAt) {
      return res.status(404).json({
        status: "error",
        message: "User not found",
      });
    }

    const hidden = await HiddenPost.find({
      userId: String(userId),
    })
      .sort({ createdAt: -1 })
      .limit(100)
      .lean();

    const postIds = hidden
      .map((item) => String(item.postId))
      .filter((id) => mongoose.Types.ObjectId.isValid(id));

    if (!postIds.length) {
      return res.status(200).json({
        status: "success",
        count: 0,
        data: [],
      });
    }

    const filter = {
      _id: { $in: postIds },
      communityId: null,
    };

    if (getUserRole(req) !== "superadmin") {
      filter.universityId = requester.universityId;
    }

    const posts = await Post.find(filter).lean();
    const withAuthors = await attachAuthorNames(posts);
    const byId = new Map(
      withAuthors.map((post) => [String(post._id), post])
    );

    const data = postIds
      .map((id) => byId.get(id))
      .filter(Boolean);

    return res.status(200).json({
      status: "success",
      count: data.length,
      data,
    });
  } catch (error) {
    console.error("Get hidden posts error:", error);

    return res.status(500).json({
      status: "error",
      message: "Failed to fetch hidden posts",
    });
  }
};

/**
 * GET /api/posts/user/:userId/reshares
 */
