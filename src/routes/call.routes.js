const router = require("express").Router();
const auth = require("../middleware/auth.middleware");
const { requireFeature } = require("../middleware/featureGuard");
const ctrl = require("../controllers/call.controller");

// Mounted at /api/calls. Fixed paths first, so "incoming" and "history" are never read as an id.
router.get("/incoming", auth, ctrl.incoming);
router.get("/history", auth, ctrl.history);
router.post("/", auth, requireFeature("messaging"), ctrl.start);
router.get("/:id", auth, ctrl.get);
router.post("/:id/accept", auth, ctrl.accept);
router.post("/:id/decline", auth, ctrl.decline);
router.post("/:id/cancel", auth, ctrl.cancel);
router.post("/:id/end", auth, ctrl.end);
router.post("/:id/ai", auth, ctrl.ai);

module.exports = router;
