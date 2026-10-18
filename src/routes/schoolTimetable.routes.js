const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/auth.middleware");
const c = require("../controllers/schoolTimetable.controller");

// Lecturers and students of the timetable's university (checked in the controller).
router.get("/", authenticate, c.participantList);
router.get("/:id", authenticate, c.participantGet);
router.post("/:id/comments", authenticate, c.participantComment);
router.put("/:id/vote", authenticate, c.participantVote);

module.exports = router;
