const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/auth.middleware");
const ctrl = require("../controllers/schedule.controller");

router.get("/mine", authenticate, ctrl.getMySchedule);

module.exports = router;
