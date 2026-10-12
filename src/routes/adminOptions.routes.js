const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/auth.middleware");
const { requireAdminOrSuperadmin } = require("../middleware/roleGuard");
const c = require("../controllers/adminOptions.controller");

router.get("/universities", authenticate, requireAdminOrSuperadmin, c.universities);
router.get("/faculties", authenticate, requireAdminOrSuperadmin, c.faculties);

module.exports = router;
