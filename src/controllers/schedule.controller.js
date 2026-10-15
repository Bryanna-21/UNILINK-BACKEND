"use strict";

// GET /api/schedule/mine: the signed-in student's or lecturer's whole week in one call, so the app
// can set class reminders without one request per course.
const Course = require("../models/Course");
const Timetable = require("../models/Timetable");
const TimetableOverride = require("../models/TimetableOverride");
const { mergeSessions } = require("../utils/mySchedule.rules");

exports.getMySchedule = async (req, res) => {
  try {
    const { id, role } = req.user;
    let query = null;
    if (role === "student") query = { enrolledStudentIds: id };
    else if (role === "lecturer") query = { lecturerId: id };
    if (!query) return res.json({ status: "success", count: 0, data: [], skipped: 0 });

    const courses = await Course.find(query).select("_id code title");
    const courseIds = courses.map((c) => c._id);
    const [timetables, overrides] = await Promise.all([
      Timetable.find({ courseId: { $in: courseIds } }),
      role === "student" ? TimetableOverride.find({ studentId: id, courseId: { $in: courseIds } }) : [],
    ]);
    const { sessions, skipped } = mergeSessions({ courses, timetables, overrides });
    res.json({ status: "success", count: sessions.length, data: sessions.slice(0, 200), skipped });
  } catch (error) {
    console.error("[schedule] mine:", error);
    res.status(500).json({ status: "error", message: "Could not load your schedule." });
  }
};
