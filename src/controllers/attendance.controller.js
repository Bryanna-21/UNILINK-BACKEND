const mongoose = require("mongoose");
const Attendance = require("../models/Attendance");
const Course = require("../models/Course");

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// Basic YYYY-MM-DD shape check — full calendar validity isn't critical
// here since this is a self-reported attendance date, not a source of
// truth for scheduling.
const isValidDateString = (d) => typeof d === "string" && /^\d{4}-\d{2}-\d{2}$/.test(d);

exports.signAttendance = async (req, res) => {
  try {
    if (!isValidId(req.params.courseId)) {
      return res.status(400).json({ status: "error", message: "Invalid course id" });
    }
    const { date } = req.body;
    if (!isValidDateString(date)) {
      return res.status(400).json({ status: "error", message: "date is required, format YYYY-MM-DD" });
    }
    const course = await Course.findById(req.params.courseId);
    if (!course) {
      return res.status(404).json({ status: "error", message: "Course not found" });
    }
    if (!course.enrolledStudentIds.includes(req.user.id)) {
      return res.status(403).json({ status: "error", message: "You are not enrolled in this course" });
    }

    const record = await Attendance.create({
      studentId: req.user.id,
      courseId: req.params.courseId,
      date,
    });
    res.status(201).json({ status: "success", data: record });
  } catch (error) {
    // Duplicate key = already signed for this student/course/date —
    // the unique index is the real enforcement, this just gives a
    // clear message instead of a raw Mongo error.
    if (error.code === 11000) {
      return res.status(409).json({ status: "error", message: "You've already signed attendance for this date" });
    }
    res.status(500).json({ status: "error", message: "Error signing attendance: " + error.message });
  }
};

exports.getMyAttendanceForCourse = async (req, res) => {
  try {
    if (!isValidId(req.params.courseId)) {
      return res.status(400).json({ status: "error", message: "Invalid course id" });
    }
    const records = await Attendance.find({
      courseId: req.params.courseId,
      studentId: req.user.id,
    }).sort({ date: -1 });
    res.status(200).json({ status: "success", count: records.length, data: records });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching your attendance: " + error.message });
  }
};

// Lecturer/admin view of everyone's attendance for a course.
exports.getAttendanceForCourse = async (req, res) => {
  try {
    if (req.user.role !== "lecturer" && req.user.role !== "admin") {
      return res.status(403).json({ status: "error", message: "Only lecturers or admins can view full attendance" });
    }
    if (!isValidId(req.params.courseId)) {
      return res.status(400).json({ status: "error", message: "Invalid course id" });
    }
    const records = await Attendance.find({ courseId: req.params.courseId }).sort({ date: -1 });
    res.status(200).json({ status: "success", count: records.length, data: records });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching attendance: " + error.message });
  }
};
