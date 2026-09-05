const router = require("express").Router();
const ctrl = require("../controllers/userNotification.controller");
const auth = require("../middleware/auth.middleware");

router.get("/", auth, ctrl.getMyNotifications);
router.patch("/:id/read", auth, ctrl.markNotificationRead);
router.patch("/read-all", auth, ctrl.markAllRead);

module.exports = router;
