const mongoose = require("mongoose");
const Timetable = require("../models/Timetable");
const TimetableOverride = require("../models/TimetableOverride");
const Course = require("../models/Course");

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// ---------- Canonical timetable (lecturer) ----------

exports.getTimetableForCourse = async (req, res) => {
  try {
    if (!isValidId(req.params.courseId)) {
      return res.status(400).json({ status: "error", message: "Invalid course id" });
    }
    const entries = await Timetable.find({ courseId: req.params.courseId }).sort({ dayOfWeek: 1, startTime: 1 });
    res.status(200).json({ status: "success", count: entries.length, data: entries });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching timetable: " + error.message });
  }
};

exports.createTimetableEntry = async (req, res) => {
  try {
    if (req.user.role !== "lecturer" && req.user.role !== "admin") {
      return res.status(403).json({ status: "error", message: "Only lecturers or admins can set the timetable" });
    }
    if (!isValidId(req.params.courseId)) {
      return res.status(400).json({ status: "error", message: "Invalid course id" });
    }
    const course = await Course.findById(req.params.courseId);
    if (!course) {
      return res.status(404).json({ status: "error", message: "Course not found" });
    }
    const { dayOfWeek, startTime, endTime, location } = req.body;
    if (!dayOfWeek || !startTime || !endTime) {
      return res.status(400).json({ status: "error", message: "dayOfWeek, startTime, and endTime are required" });
    }
    const entry = await Timetable.create({
      courseId: req.params.courseId,
      dayOfWeek,
      startTime,
      endTime,
      location,
      setByLecturerId: req.user.id,
    });
    res.status(201).json({ status: "success", data: entry });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error creating timetable entry: " + error.message });
  }
};

exports.deleteTimetableEntry = async (req, res) => {
  try {
    if (req.user.role !== "lecturer" && req.user.role !== "admin") {
      return res.status(403).json({ status: "error", message: "Only lecturers or admins can edit the timetable" });
    }
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ status: "error", message: "Invalid timetable entry id" });
    }
    const entry = await Timetable.findByIdAndDelete(req.params.id);
    if (!entry) {
      return res.status(404).json({ status: "error", message: "Timetable entry not found" });
    }
    res.status(200).json({ status: "success", message: "Timetable entry deleted" });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error deleting timetable entry: " + error.message });
  }
};

// ---------- Student's personal merged view ----------
// Canonical entries for the course, with any of THIS student's
// overrides swapped in place of their matching original entry.

exports.getMyScheduleForCourse = async (req, res) => {
  try {
    if (!isValidId(req.params.courseId)) {
      return res.status(400).json({ status: "error", message: "Invalid course id" });
    }
    const [canonical, overrides] = await Promise.all([
      Timetable.find({ courseId: req.params.courseId }),
      TimetableOverride.find({ courseId: req.params.courseId, studentId: req.user.id }),
    ]);

    const overrideByOriginalId = new Map(
      overrides.map((o) => [o.originalTimetableId.toString(), o])
    );

    const merged = canonical.map((entry) => {
      const override = overrideByOriginalId.get(entry._id.toString());
      if (!override) return { ...entry.toObject(), isOverridden: false };
      return {
        _id: entry._id,
        dayOfWeek: override.dayOfWeek,
        startTime: override.startTime,
        endTime: override.endTime,
        location: override.location,
        isOverridden: true,
      };
    });

    res.status(200).json({ status: "success", count: merged.length, data: merged });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching your schedule: " + error.message });
  }
};

exports.setMyOverride = async (req, res) => {
  try {
    if (!isValidId(req.params.timetableId)) {
      return res.status(400).json({ status: "error", message: "Invalid timetable entry id" });
    }
    const original = await Timetable.findById(req.params.timetableId);
    if (!original) {
      return res.status(404).json({ status: "error", message: "Original timetable entry not found" });
    }
    const { dayOfWeek, startTime, endTime, location } = req.body;
    if (!dayOfWeek || !startTime || !endTime) {
      return res.status(400).json({ status: "error", message: "dayOfWeek, startTime, and endTime are required" });
    }

    const override = await TimetableOverride.findOneAndUpdate(
      { studentId: req.user.id, originalTimetableId: req.params.timetableId },
      {
        studentId: req.user.id,
        courseId: original.courseId,
        originalTimetableId: req.params.timetableId,
        dayOfWeek,
        startTime,
        endTime,
        location,
      },
      { upsert: true, new: true, runValidators: true }
    );
    res.status(200).json({ status: "success", data: override });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error setting your override: " + error.message });
  }
};

exports.deleteMyOverride = async (req, res) => {
  try {
    if (!isValidId(req.params.timetableId)) {
      return res.status(400).json({ status: "error", message: "Invalid timetable entry id" });
    }
    await TimetableOverride.findOneAndDelete({
      studentId: req.user.id,
      originalTimetableId: req.params.timetableId,
    });
    res.status(200).json({ status: "success", message: "Override removed, reverted to the canonical schedule" });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error removing your override: " + error.message });
  }
};
