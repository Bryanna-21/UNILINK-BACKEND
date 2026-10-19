const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/auth.middleware");
const { requireAdminOrSuperadmin } = require("../middleware/roleGuard");
const c = require("../controllers/enforcement.controller");

// Mounted at /api/admin/moderation, next to the report queue (moderationAdmin.routes.js).
const guard = [authenticate, requireAdminOrSuperadmin];

// Impose a penalty because of a report
router.post("/reports/:id/actions", ...guard, c.impose);

// Penalties: the queue (default: closures waiting for a second moderator), one decision, and what
// can be done to it
router.get("/actions", ...guard, c.listActions);
router.get("/actions/:id", ...guard, c.getAction);
router.post("/actions/:id/approve", ...guard, c.approve);
router.post("/actions/:id/reject", ...guard, c.reject);
router.post("/actions/:id/revoke", ...guard, c.revoke);

// Appeals
router.get("/appeals", ...guard, c.listAppeals);
router.get("/appeals/:id", ...guard, c.getAppeal);
router.post("/appeals/:id/decide", ...guard, c.decideAppeal);

module.exports = router;
