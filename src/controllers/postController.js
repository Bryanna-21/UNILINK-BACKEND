let posts = [];

exports.createPost = (req, res) => {
  const { title, content } = req.body;

  const newPost = {
    id: Date.now(),
    title,
    content
  };

  posts.push(newPost);

  res.json(newPost);
};

exports.getPosts = (req, res) => {
  res.json(posts);
};
