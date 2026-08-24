const router = require("express").Router();

const ctrl = require("../controllers/post.controller");
const auth = require("../middleware/auth.middleware");
const { uploadPostMedia } = require("../middleware/upload.middleware");

// ============================================================
// CANONICAL POST API
// ============================================================

// Get authenticated user's feed
router.get("/", auth, ctrl.getFeed);

// Create a post
router.post("/", auth, uploadPostMedia, ctrl.createPost);

// ============================================================
// POST ACTIONS
// ============================================================

// Like / unlike a post
router.post("/like/:id", auth, ctrl.likePost);

// ============================================================
// BACKWARDS-COMPATIBLE ALIASES
// ============================================================

// Legacy create endpoint
router.post("/create", auth, uploadPostMedia, ctrl.createPost);

// Legacy feed endpoint
router.get("/feed", auth, ctrl.getFeed);

// ============================================================
// DYNAMIC ROUTES — KEEP LAST
// ============================================================

// Get a specific post
router.get("/:id", auth, ctrl.getPostById);

// Delete a specific post
router.delete("/:id", auth, ctrl.deletePost);

module.exports = router;
