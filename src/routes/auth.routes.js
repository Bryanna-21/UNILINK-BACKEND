const express = require("express");
const router = express.Router();
const jwt = require("jsonwebtoken");
const bcryptjs = require("bcryptjs");
const User = require("../models/User");

// Kept as the single source of truth for valid roles across the app
// (used by scripts/seedAdmin.js). Not used to trust a client-supplied
// role in /register — see the comment there.
const VALID_ROLES = ["student", "lecturer", "admin"];

// Generates a JWT carrying every field the rest of the app relies on.
// Every downstream consumer (auth.middleware.js, post.controller.js,
// emergency.controller.js) reads req.user.id / req.user.role /
// req.user.universityId, so all three must be signed into the token.
const generateToken = (user) => {
  return jwt.sign(
    {
      id: user._id,
      role: user.role,
      universityId: user.universityId,
    },
    process.env.JWT_SECRET,
    { expiresIn: "24h" }
  );
};

// Register route
router.post("/register", async (req, res) => {
  try {
    const { name, email, password, confirmPassword, universityId } = req.body;

    if (!name || !email || !password || !confirmPassword) {
      return res.status(400).json({
        status: "error",
        message: "Please provide all required fields",
      });
    }

    if (password !== confirmPassword) {
      return res.status(400).json({
        status: "error",
        message: "Passwords do not match",
      });
    }

    if (password.length < 6) {
      return res.status(400).json({
        status: "error",
        message: "Password must be at least 6 characters long",
      });
    }

    // SECURITY: public registration can only ever create "student" accounts.
    // Any "role" field in the request body is intentionally ignored — do not
    // reintroduce a client-supplied role here. Admin and lecturer accounts
    // must be created through scripts/seedAdmin.js or a protected,
    // admin-authenticated endpoint, never through this public route.
    const requestedRole = "student";

    const existingUser = await User.findOne({ email });
    if (existingUser) {
      return res.status(400).json({
        status: "error",
        message: "User with this email already exists",
      });
    }

    const hashedPassword = await bcryptjs.hash(password, 10);

    const newUser = await User.create({
      name,
      email,
      password: hashedPassword,
      universityId,
      role: requestedRole,
    });

    const token = generateToken(newUser);

    res.status(201).json({
      status: "success",
      message: "User registered successfully",
      token,
      user: {
        id: newUser._id,
        name: newUser.name,
        email: newUser.email,
        role: newUser.role,
        universityId: newUser.universityId,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Error registering user: " + error.message,
    });
  }
});

// Login route
router.post("/login", async (req, res) => {
  try {
    const { email, password } = req.body;

    if (!email || !password) {
      return res.status(400).json({
        status: "error",
        message: "Please provide email and password",
      });
    }

    const user = await User.findOne({ email });

    if (!user) {
      return res.status(400).json({
        status: "error",
        message: "Invalid email or password",
      });
    }

    const isPasswordValid = await bcryptjs.compare(password, user.password);

    if (!isPasswordValid) {
      return res.status(400).json({
        status: "error",
        message: "Invalid email or password",
      });
    }

    const token = generateToken(user);

    res.status(200).json({
      status: "success",
      message: "Login successful",
      token,
      user: {
        id: user._id,
        name: user.name,
        email: user.email,
        role: user.role,
        universityId: user.universityId,
      },
    });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Error logging in: " + error.message,
    });
  }
});

router.VALID_ROLES = VALID_ROLES;

module.exports = router;
