const mongoose = require("mongoose");
const Post = require("../models/Post");
const User = require("../models/User");
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
    .select("_id name")
    .lean();

  const nameById = new Map(users.map((u) => [String(u._id), u.name]));

  return posts.map((p) => ({
    ...p,
    authorName: nameById.get(String(p.userId)) || "Unknown user",
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

    if (!title) {
      return res.status(400).json({
        status: "error",
        message: "Post title is required",
      });
    }

    if (title.length < 5) {
      return res.status(400).json({
        status: "error",
        message: "Post title must be at least 5 characters",
      });
    }

    if (!content) {
      return res.status(400).json({
        status: "error",
        message: "Post content is required",
      });
    }

    if (content.length < 10) {
      return res.status(400).json({
        status: "error",
        message: "Post content must be at least 10 characters",
      });
    }

    const files = req.files || [];
    let media = [];

    if (files.length > 0) {
      try {
        const uploads = await Promise.all(
          files.map(async (file) => {
            const resourceType = file.mimetype.startsWith("video/")
              ? "video"
              : "image";

            const result = await uploadBufferToCloudinary(
              file.buffer,
              "unilink/posts",
              resourceType
            );

            return {
              url: result.secure_url,
              type: resourceType,
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

    const post = await Post.create({
      userId,
      universityId: req.user?.universityId || null,
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
    const posts = await Post.find({})
      .sort({ score: -1, createdAt: -1 })
      .limit(50)
      .lean();

    const postsWithAuthors = await attachAuthorNames(posts);

    return res.status(200).json({
      status: "success",
      count: postsWithAuthors.length,
      data: postsWithAuthors,
    });
  } catch (error) {
    console.error("Get feed error:", error);

    return res.status(500).json({
      status: "error",
      message: "Error fetching feed: " + error.message,
    });
  }
};

exports.getPostById = async (req, res) => {
  try {
    const { id } = req.params;

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

    return res.status(200).json({
      status: "success",
      data: postWithAuthor,
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
            resource_type: media.type === "video" ? "video" : "image",
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

exports.likePost = async (req, res) => {
  try {
    const { id } = req.params;

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

    post.likes += 1;
    post.score += 2;

    await post.save();

    return res.status(200).json({
      status: "success",
      data: post,
    });
  } catch (error) {
    console.error("Like post error:", error);

    return res.status(500).json({
      status: "error",
      message: "Error liking post: " + error.message,
    });
  }
};
