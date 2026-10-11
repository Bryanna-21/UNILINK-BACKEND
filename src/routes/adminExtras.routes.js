const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/auth.middleware");
const { requireAdminOrSuperadmin } = require("../middleware/roleGuard");
const c = require("../controllers/adminExtras.controller");

const guard = [authenticate, requireAdminOrSuperadmin];

router.get("/scope", ...guard, c.getScope);
router.get("/dashboard/stats", ...guard, c.getStats);
router.get("/dashboard/recent-users", ...guard, c.getRecentUsers);

router.get("/lecturers", ...guard, c.listLecturers);
router.post("/lecturers", ...guard, c.createLecturer);
router.put("/lecturers/:id", ...guard, c.updateLecturer);
router.delete("/lecturers/:id", ...guard, c.removeLecturer);

router.get("/announcements", ...guard, c.listAnnouncements);
router.post("/announcements", ...guard, c.createAnnouncement);
router.delete("/announcements/:id", ...guard, c.deleteAnnouncement);

router.get("/posts", ...guard, c.listPosts);

module.exports = router;
