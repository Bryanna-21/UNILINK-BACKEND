const Post = require("../models/Post");

exports.createPost = async (req, res) => {
  const post = await Post.create({
    userId: req.user.id,
    universityId: req.user.universityId,
    content: req.body.content
  });

  res.json(post);
};

exports.getFeed = async (req, res) => {
  const posts = await Post.find({})
    .sort({ score: -1, createdAt: -1 })
    .limit(50);

  res.json(posts);
};

exports.likePost = async (req, res) => {
  const post = await Post.findById(req.params.id);

  post.likes += 1;
  post.score += 2;

  await post.save();

  res.json(post);
};
