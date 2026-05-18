const express = require('express');
const router = express.Router();
const jwt = require('jsonwebtoken');
const bcryptjs = require('bcryptjs');

// Mock user storage for now
const users = new Map();
let userIdCounter = 1;

// Helper function to generate JWT token
const generateToken = (userId) => {
  return jwt.sign(
    { id: userId },
    process.env.JWT_SECRET || 'default_secret_key',
    { expiresIn: '24h' }
  );
};

// Register route
router.post('/register', async (req, res) => {
  try {
    const { name, email, password, confirmPassword } = req.body;

    // Validation
    if (!name || !email || !password || !confirmPassword) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide all required fields'
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        status: 'error',
        message: 'Passwords do not match'
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        status: 'error',
        message: 'Password must be at least 6 characters long'
      });
    }

    // Check if user already exists
    const existingUser = Array.from(users.values()).find(u => u.email === email);
    if (existingUser) {
      return res.status(400).json({
        status: 'error',
        message: 'User with this email already exists'
      });
    }

    // Hash password
    const hashedPassword = await bcryptjs.hash(password, 10);

    const userId = userIdCounter.toString();
    userIdCounter++;

    const newUser = {
      id: userId,
      name,
      email,
      password: hashedPassword,
      createdAt: new Date().toISOString()
    };

    users.set(userId, newUser);

    const token = generateToken(userId);

    res.status(201).json({
      status: 'success',
      message: 'User registered successfully',
      token,
      user: {
        id: newUser.id,
        name: newUser.name,
        email: newUser.email
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error registering user: ' + error.message
    });
  }
});

// Login route
router.post('/login', async (req, res) => {
  try {
    const { email, password } = req.body;

    // Validation
    if (!email || !password) {
      return res.status(400).json({
        status: 'error',
        message: 'Please provide email and password'
      });
    }

    // Find user by email
    const user = Array.from(users.values()).find(u => u.email === email);

    if (!user) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid email or password'
      });
    }

    // Compare passwords
    const isPasswordValid = await bcryptjs.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(400).json({
        status: 'error',
        message: 'Invalid email or password'
      });
    }

    const token = generateToken(user.id);

    res.status(200).json({
      status: 'success',
      message: 'Login successful',
      token,
      user: {
        id: user.id,
        name: user.name,
        email: user.email
      }
    });
  } catch (error) {
    res.status(500).json({
      status: 'error',
      message: 'Error logging in: ' + error.message
    });
  }
});

module.exports = router;
