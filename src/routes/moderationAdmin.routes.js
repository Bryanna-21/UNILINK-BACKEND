const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/auth.middleware");
const { requireAdminOrSuperadmin } = require("../middleware/roleGuard");
const c = require("../controllers/moderationAdmin.controller");

const guard = [authenticate, requireAdminOrSuperadmin];

router.get("/reports", ...guard, c.list);
router.get("/reports/:id", ...guard, c.detail);
router.post("/reports/:id/assign", ...guard, c.assign);
router.post("/reports/:id/note", ...guard, c.addNote);
router.post("/reports/:id/escalate", ...guard, c.escalate);
router.post("/reports/:id/resolve", ...guard, c.resolve);

module.exports = router;
