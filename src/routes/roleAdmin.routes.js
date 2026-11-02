const router = require("express").Router();
const auth = require("../middleware/auth.middleware");
const { requireAdminOrSuperadmin } = require("../middleware/roleGuard");
const ctrl = require("../controllers/roleAdmin.controller");

// Mounted at /api/admin/roles. Search first, so "users" is never read as a user id.
router.get("/users", auth, requireAdminOrSuperadmin, ctrl.searchUsers);
router.patch("/:id", auth, requireAdminOrSuperadmin, ctrl.changeRole);

module.exports = router;
