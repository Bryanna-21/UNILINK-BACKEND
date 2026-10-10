const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/auth.middleware");
const { requireAdminOrSuperadmin } = require("../middleware/roleGuard");
const ctrl = require("../controllers/staffChat.controller");

// Admins and superadmins only. Students and lecturers get 403 from the guard.
router.get("/messages", authenticate, requireAdminOrSuperadmin, ctrl.listMessages);
router.post("/messages", authenticate, requireAdminOrSuperadmin, ctrl.sendMessage);
router.delete("/messages/:id", authenticate, requireAdminOrSuperadmin, ctrl.deleteMessage);

module.exports = router;
