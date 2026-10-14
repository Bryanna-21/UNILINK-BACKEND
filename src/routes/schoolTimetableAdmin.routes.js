const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/auth.middleware");
const { requireAdminOrSuperadmin } = require("../middleware/roleGuard");
const c = require("../controllers/schoolTimetable.controller");

const guard = [authenticate, requireAdminOrSuperadmin];
router.get("/", ...guard, c.adminList);
router.post("/", ...guard, c.adminCreate);
router.get("/:id", ...guard, c.adminGet);
router.put("/:id", ...guard, c.adminUpdate);
router.post("/:id/publish", ...guard, c.adminPublish);
router.post("/:id/finalize", ...guard, c.adminFinalize);
router.post("/:id/comments", ...guard, c.adminComment);
router.delete("/:id", ...guard, c.adminDelete);

module.exports = router;
