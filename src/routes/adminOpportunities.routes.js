const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/auth.middleware");
const { requireAdminOrSuperadmin } = require("../middleware/roleGuard");
const ctrl = require("../controllers/opportunities.controller");

const guard = [authenticate, requireAdminOrSuperadmin];
router.get("/", ...guard, ctrl.list);
router.post("/", ...guard, ctrl.create);
router.delete("/:id", ...guard, ctrl.remove);

module.exports = router;
