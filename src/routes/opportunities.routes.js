const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/auth.middleware");
const ctrl = require("../controllers/opportunities.controller");

// Any signed-in user: the active listings for their university and for all of UniLink.
router.get("/", authenticate, ctrl.listForStudents);

module.exports = router;
