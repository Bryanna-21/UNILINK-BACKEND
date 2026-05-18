const express = require('express');
const router = express.Router();

// Mock Posts storage for now
const posts = new Map();
let postIdCounter = 1;

// Mock authentication middleware
const auth = (req, res, next) => {
  const token = req.header('Authorization');
  if (!token) {
    return res.status(401).json({
      status: 'error',
      message: 'No token provided'
    });
  }
  req.userId = 'user-' + Date.now(); // Mock user ID
  next();
};

// Get all posts
router.get('/', (req, res) => {
  try {
    const allPosts = Array.from(posts.values());
    res.status(200).json({
      status: 'success',
      count: allPosts.length,
      data: allPosts
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error fetching posts: ' + error.message
    });
  }
});

// Get single post by ID
router.get('/:id', (req, res) => {
  try {
    const post = posts.get(req.params.id);
    
    if (!post) {
      return res.status(404).json({
        status: 'error',
        message: 'Post not found'
      });
    }

    res.status(200).json({
      status: 'success',
      data: post
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error fetching post: ' + error.message
    });
  }
});

// Create new post
router.post('/', auth, (req, res) => {
  try {
    const { title, content } = req.body;

    // Validation
    if (!title || !content) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide title and content'
      });
    }

    if (title.length < 5) {
      return res.status(400).json({
        status: 'error',
        message: 'Title must be at least 5 characters long'
      });
    }

    if (content.length < 10) {
      return res.status(400).json({
        status: 'error',
        message: 'Content must be at least 10 characters long'
      });
    }

    const postId = postIdCounter.toString();
    postIdCounter++;

    const newPost = {
      id: postId,
      title,
      content,
      author: req.userId,
      createdAt: new Date().toISOString(),
      updatedAt: new Date().toISOString()
    };

    posts.set(postId, newPost);

    res.status(201).json({
      status: 'success',
      message: 'Post created successfully',
      data: newPost
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error creating post: ' + error.message
    });
  }
});

// Update post
router.put('/:id', auth, (req, res) => {
  try {
    const post = posts.get(req.params.id);

    if (!post) {
      return res.status(404).json({
        status: 'error',
        message: 'Post not found'
      });
    }

    if (post.author !== req.userId) {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized to update this post'
      });
    }

    const { title, content } = req.body;

    if (title) {
      if (title.length < 5) {
        return res.status(400).json({
          status: 'error',
          message: 'Title must be at least 5 characters long'
        });
      }
      post.title = title;
    }

    if (content) {
      if (content.length < 10) {
        return res.status(400).json({
          status: 'error',
          message: 'Content must be at least 10 characters long'
        });
      }
      post.content = content;
    }

    post.updatedAt = new Date().toISOString();
    posts.set(req.params.id, post);

    res.status(200).json({
      status: 'success',
      message: 'Post updated successfully',
      data: post
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error updating post: ' + error.message
    });
  }
});

// Delete post
router.delete('/:id', auth, (req, res) => {
  try {
    const post = posts.get(req.params.id);

    if (!post) {
      return res.status(404).json({
        status: 'error',
        message: 'Post not found'
      });
    }

    if (post.author !== req.userId) {
      return res.status(403).json({
        status: 'error',
        message: 'Not authorized to delete this post'
      });
    }

    posts.delete(req.params.id);

    res.status(200).json({
      status: 'success',
      message: 'Post deleted successfully'
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error deleting post: ' + error.message
    });
  }
});

module.exports = router;
