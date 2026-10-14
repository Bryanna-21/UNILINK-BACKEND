const express = require("express");
const router = express.Router();
const authenticate = require("../middleware/auth.middleware");
const c = require("../controllers/schoolTimetable.controller");

// Lecturers only (checked in the controller): published timetables of their own university.
router.get("/", authenticate, c.lecturerList);
router.get("/:id", authenticate, c.lecturerGet);
router.post("/:id/comments", authenticate, c.lecturerComment);
router.put("/:id/vote", authenticate, c.lecturerVote);

module.exports = router;
