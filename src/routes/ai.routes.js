const router = require("express").Router();
const ctrl = require("../controllers/ai.controller");
const auth = require("../middleware/auth.middleware");

// Auth required (any logged-in role) - not admin-only, this is a
// student/lecturer-facing study tool. Rate limiting happens per-user
// inside the controller via AiUsage, not here.
router.post("/ask", auth, ctrl.ask);

module.exports = router;
