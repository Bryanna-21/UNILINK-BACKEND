const mongoose = require("mongoose");
const User = require("../models/User");
const Course = require("../models/Course");
const Unit = require("../models/Unit");
const Assignment = require("../models/Assignment");
const Submission = require("../models/Submission");
const CAT = require("../models/CAT");
const Result = require("../models/Result");

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);
exports.getCourses = async (req, res) => {
  try {
    let query = {};
    if (req.user.role === "student") {
      query = { enrolledStudentIds: req.user.id };
    } else if (req.user.role === "lecturer") {
      query = { lecturerId: req.user.id };
    }
    // admin: no filter, sees every course
    const courses = await Course.find(query).sort({ createdAt: -1 });
    res.status(200).json({ status: "success", count: courses.length, data: courses });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching courses: " + error.message });
  }
};

exports.getCourseById = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ status: "error", message: "Invalid course id" });
    }
    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ status: "error", message: "Course not found" });
    }
    res.status(200).json({ status: "success", data: course });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching course: " + error.message });
  }
};

exports.createCourse = async (req, res) => {
  try {
    if (req.user.role !== "lecturer" && req.user.role !== "admin") {
      return res.status(403).json({ status: "error", message: "Only lecturers or admins can create courses" });
    }
    const { title, code, description } = req.body;
    if (!title || !code) {
      return res.status(400).json({ status: "error", message: "title and code are required" });
    }
    const course = await Course.create({
      title,
      code,
      description,
      universityId: req.user.universityId,
      lecturerId: req.user.role === "lecturer" ? req.user.id : req.body.lecturerId
    });
    res.status(201).json({ status: "success", data: course });
  } catch (error) {
    // 11000 = MongoDB duplicate key error, thrown by the unique index
    // on { universityId, code } (see models/Course.js).
    if (error.code === 11000) {
      return res.status(409).json({
        status: "error",
        message: "A course with this code already exists at your university.",
      });
    }
    res.status(500).json({ status: "error", message: "Error creating course: " + error.message });
  }
};

exports.enrollInCourse = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ status: "error", message: "Invalid course id" });
    }
    const course = await Course.findById(req.params.id);
    if (!course) {
      return res.status(404).json({ status: "error", message: "Course not found" });
    }
    if (!course.enrolledStudentIds.includes(req.user.id)) {
      course.enrolledStudentIds.push(req.user.id);
      await course.save();
    }
    res.status(200).json({ status: "success", data: course });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error enrolling in course: " + error.message });
  }
};

// ---------- Units ----------

exports.getUnitsForCourse = async (req, res) => {
  try {
    const units = await Unit.find({ courseId: req.params.courseId }).sort({ order: 1 });
    res.status(200).json({ status: "success", count: units.length, data: units });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching units: " + error.message });
  }
};

exports.createUnit = async (req, res) => {
  try {
    if (req.user.role !== "lecturer" && req.user.role !== "admin") {
      return res.status(403).json({ status: "error", message: "Only lecturers or admins can create units" });
    }
    const { title, description, order } = req.body;
    if (!title) {
      return res.status(400).json({ status: "error", message: "title is required" });
    }
    const unit = await Unit.create({ courseId: req.params.courseId, title, description, order });
    res.status(201).json({ status: "success", data: unit });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        status: "error",
        message: "A unit with this title already exists in this course.",
      });
    }
    res.status(500).json({ status: "error", message: "Error creating unit: " + error.message });
  }
};

// ---------- Assignments ----------

exports.getAssignmentsForCourse = async (req, res) => {
  try {
    const assignments = await Assignment.find({ courseId: req.params.courseId }).sort({ dueDate: 1 });
    res.status(200).json({ status: "success", count: assignments.length, data: assignments });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching assignments: " + error.message });
  }
};

exports.getAssignmentById = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ status: "error", message: "Invalid assignment id" });
    }
    const assignment = await Assignment.findById(req.params.id);
    if (!assignment) {
      return res.status(404).json({ status: "error", message: "Assignment not found" });
    }
    res.status(200).json({ status: "success", data: assignment });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching assignment: " + error.message });
  }
};

exports.createAssignment = async (req, res) => {
  try {
    if (req.user.role !== "lecturer" && req.user.role !== "admin") {
      return res.status(403).json({ status: "error", message: "Only lecturers or admins can create assignments" });
    }
    const { title, instructions, dueDate, maxScore } = req.body;
    if (!title) {
      return res.status(400).json({ status: "error", message: "title is required" });
    }
    const assignment = await Assignment.create({
      courseId: req.params.courseId,
      title,
      instructions,
      dueDate,
      maxScore,
      createdBy: req.user.id
    });
    res.status(201).json({ status: "success", data: assignment });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error creating assignment: " + error.message });
  }
};

// ---------- Submissions ----------

exports.submitAssignment = async (req, res) => {
  try {
    if (!isValidId(req.params.assignmentId)) {
      return res.status(400).json({ status: "error", message: "Invalid assignment id" });
    }
    const assignment = await Assignment.findById(req.params.assignmentId);
    if (!assignment) {
      return res.status(404).json({ status: "error", message: "Assignment not found" });
    }
    const { textAnswer } = req.body;
    if (!textAnswer || !textAnswer.trim()) {
      return res.status(400).json({ status: "error", message: "textAnswer is required" });
    }

    // One submission per student per assignment — resubmitting updates the existing one.
    const existing = await Submission.findOne({
      assignmentId: req.params.assignmentId,
      studentId: req.user.id
    });

    if (existing) {
      existing.textAnswer = textAnswer;
      existing.submittedAt = new Date();
      await existing.save();
      return res.status(200).json({ status: "success", data: existing });
    }

    const submission = await Submission.create({
      assignmentId: req.params.assignmentId,
      studentId: req.user.id,
      textAnswer
    });
    res.status(201).json({ status: "success", data: submission });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error submitting assignment: " + error.message });
  }
};

exports.getMySubmission = async (req, res) => {
  try {
    const submission = await Submission.findOne({
      assignmentId: req.params.assignmentId,
      studentId: req.user.id
    });
    res.status(200).json({ status: "success", data: submission || null });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching submission: " + error.message });
  }
};

exports.getSubmissionsForAssignment = async (req, res) => {
  try {
    if (req.user.role !== "lecturer" && req.user.role !== "admin") {
      return res.status(403).json({ status: "error", message: "Only lecturers or admins can view all submissions" });
    }
    const submissions = await Submission.find({ assignmentId: req.params.assignmentId }).sort({ submittedAt: -1 });
    res.status(200).json({ status: "success", count: submissions.length, data: submissions });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching submissions: " + error.message });
  }
};

exports.gradeSubmission = async (req, res) => {
  try {
    if (req.user.role !== "lecturer" && req.user.role !== "admin") {
      return res.status(403).json({ status: "error", message: "Only lecturers or admins can grade submissions" });
    }
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ status: "error", message: "Invalid submission id" });
    }
    const { grade, feedback } = req.body;
    if (typeof grade !== "number") {
      return res.status(400).json({ status: "error", message: "grade must be a number" });
    }
    const submission = await Submission.findById(req.params.id);
    if (!submission) {
      return res.status(404).json({ status: "error", message: "Submission not found" });
    }
    submission.grade = grade;
    submission.feedback = feedback;
    submission.gradedAt = new Date();
    submission.gradedBy = req.user.id;
    await submission.save();
    res.status(200).json({ status: "success", data: submission });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error grading submission: " + error.message });
  }
};

// ---------- CATs ----------

exports.getCatsForCourse = async (req, res) => {
  try {
    const cats = await CAT.find({ courseId: req.params.courseId }).sort({ date: 1 });
    res.status(200).json({ status: "success", count: cats.length, data: cats });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching CATs: " + error.message });
  }
};

exports.getCatById = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ status: "error", message: "Invalid CAT id" });
    }
    const cat = await CAT.findById(req.params.id);
    if (!cat) {
      return res.status(404).json({ status: "error", message: "CAT not found" });
    }
    res.status(200).json({ status: "success", data: cat });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching CAT: " + error.message });
  }
};

exports.createCat = async (req, res) => {
  try {
    if (req.user.role !== "lecturer" && req.user.role !== "admin") {
      return res.status(403).json({ status: "error", message: "Only lecturers or admins can create CATs" });
    }
    const { title, date, venue, coverage, maxScore, unitId } = req.body;
    if (!title) {
      return res.status(400).json({ status: "error", message: "title is required" });
    }
    const cat = await CAT.create({
      courseId: req.params.courseId,
      unitId,
      title,
      date,
      venue,
      coverage,
      maxScore,
      createdBy: req.user.id
    });
    res.status(201).json({ status: "success", data: cat });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error creating CAT: " + error.message });
  }
};

// ---------- Results ----------

exports.publishResult = async (req, res) => {
  try {
    if (req.user.role !== "lecturer" && req.user.role !== "admin") {
      return res.status(403).json({ status: "error", message: "Only lecturers or admins can publish results" });
    }
    if (!isValidId(req.params.catId)) {
      return res.status(400).json({ status: "error", message: "Invalid CAT id" });
    }
    const { studentId, score, feedback } = req.body;
    if (!studentId || typeof score !== "number") {
      return res.status(400).json({ status: "error", message: "studentId and numeric score are required" });
    }

    const existing = await Result.findOne({ catId: req.params.catId, studentId });
    if (existing) {
      existing.score = score;
      existing.feedback = feedback;
      existing.publishedAt = new Date();
      existing.publishedBy = req.user.id;
      await existing.save();
      return res.status(200).json({ status: "success", data: existing });
    }

    const result = await Result.create({
      catId: req.params.catId,
      studentId,
      score,
      feedback,
      publishedBy: req.user.id
    });
    res.status(201).json({ status: "success", data: result });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error publishing result: " + error.message });
  }
};

exports.getMyResultForCat = async (req, res) => {
  try {
    const result = await Result.findOne({ catId: req.params.catId, studentId: req.user.id });
    res.status(200).json({ status: "success", data: result || null });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching result: " + error.message });
  }
};

// Lists the students enrolled in a course, for the "start a new
// conversation" flow in Messages — a student can only see the roster
// of a course they're themselves enrolled in. Deliberately stricter
// than getCourseById (which has no enrollment check at all): a course
// title is low-sensitivity, a list of real names is not, so this
// endpoint checks membership even though its neighbor doesn't.
//
// Returns only _id/name/role per student, same minimal-exposure
// pattern as profile.controller.js's getUserSummary — never email,
// universityId, or status.
exports.getStudentsForCourse = async (req, res) => {
  try {
    if (!isValidId(req.params.courseId)) {
      return res.status(400).json({ status: "error", message: "Invalid course id" });
    }

    const course = await Course.findById(req.params.courseId);
    if (!course) {
      return res.status(404).json({ status: "error", message: "Course not found" });
    }

    const enrolledIds = Array.isArray(course.enrolledStudentIds) ? course.enrolledStudentIds : [];
    if (!enrolledIds.includes(req.user.id)) {
      return res.status(403).json({
        status: "error",
        message: "You must be enrolled in this course to view its roster",
      });
    }

    const students = await User.find({ _id: { $in: enrolledIds } }).select("name role");

    res.status(200).json({
      status: "success",
      count: students.length,
      data: students.map((s) => ({ _id: s._id, name: s.name, role: s.role })),
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching course roster: " + error.message });
  }
};
