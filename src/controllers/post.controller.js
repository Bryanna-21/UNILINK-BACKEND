const mongoose = require("mongoose");
const Post = require("../models/Post");

exports.createPost = async (req, res) => {
  try {
    const { content, mediaUrl } = req.body;

    if (!content || !content.trim()) {
      return res.status(400).json({
        status: "error",
        message: "Post content is required",
      });
    }

    const post = await Post.create({
      userId: req.user.id,
      universityId: req.user.universityId,
      content,
      mediaUrl,
    });

    res.status(201).json({
      status: "success",
      data: post,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Error creating post: " + error.message,
    });
  }
};

exports.getFeed = async (req, res) => {
  try {
    const posts = await Post.find({})
      .sort({ score: -1, createdAt: -1 })
      .limit(50);

    res.status(200).json({
      status: "success",
      count: posts.length,
      data: posts,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Error fetching feed: " + error.message,
    });
  }
};

exports.likePost = async (req, res) => {
  try {
    if (!mongoose.Types.ObjectId.isValid(req.params.id)) {
      return res.status(400).json({
        status: "error",
        message: "Invalid post id",
      });
    }

    const post = await Post.findById(req.params.id);

    if (!post) {
      return res.status(404).json({
        status: "error",
        message: "Post not found",
      });
    }

    post.likes += 1;
    post.score += 2;

    await post.save();

    res.status(200).json({
      status: "success",
      data: post,
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Error liking post: " + error.message,
    });
  }
};
