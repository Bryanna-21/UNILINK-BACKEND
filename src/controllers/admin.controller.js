const User = require("../models/User");
const University = require("../models/University");
const Course = require("../models/Course");
const Unit = require("../models/Unit");
const EmergencyReport = require("../models/EmergencyReport");
const AuditLog = require("../models/AuditLog");
const Notification = require("../models/Notification");
const mongoose = require("mongoose");
const logAdminAction = require("../middleware/auditLog.middleware");

// ---------------------------------------------------------------------
// Dashboard
// ---------------------------------------------------------------------

exports.getDashboardStats = async (req, res) => {
  try {
    const [totalStudents, totalLecturers, totalUsers, totalUniversities, pendingUniversities, openReports] =
      await Promise.all([
        User.countDocuments({ role: "student" }),
        User.countDocuments({ role: "lecturer" }),
        User.countDocuments({}),
        University.countDocuments({}),
        University.countDocuments({ verified: false }),
        EmergencyReport.countDocuments({ status: "open" }),
      ]);

    res.status(200).json({
      status: "success",
      data: {
        totalStudents,
        totalLecturers,
        totalUsers,
        totalUniversities,
        pendingUniversities,
        openReports,
      },
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching dashboard stats: " + error.message });
  }
};

// Recent registrations across all roles, newest first. Used for the
// dashboard's "Recent Activity" section — real data, not simulated.
exports.getRecentUsers = async (req, res) => {
  try {
    const limit = Math.min(parseInt(req.query.limit) || 10, 50);
    const users = await User.find({})
      .select("name email role status createdAt")
      .sort({ createdAt: -1 })
      .limit(limit)
      .lean();

    res.status(200).json({ status: "success", data: users });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching recent users: " + error.message });
  }
};

// ---------------------------------------------------------------------
// Students
// ---------------------------------------------------------------------

exports.getStudents = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const search = (req.query.search || "").trim();
    const status = req.query.status; // "active" | "suspended"
    const universityId = req.query.universityId;

    const query = { role: "student" };
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }
    if (status && ["active", "suspended"].includes(status)) {
      query.status = status;
    }
    if (universityId) {
      query.universityId = universityId;
    }

    const [students, total] = await Promise.all([
      User.find(query)
        .select("-password")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
    ]);

    res.status(200).json({
      status: "success",
      data: students,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching students: " + error.message });
  }
};

exports.getStudentById = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ status: "error", message: "Invalid student id" });
    }

    const student = await User.findOne({ _id: id, role: "student" }).select("-password").lean();
    if (!student) {
      return res.status(404).json({ status: "error", message: "Student not found" });
    }

    res.status(200).json({ status: "success", data: student });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching student: " + error.message });
  }
};

// ---------------------------------------------------------------------
// Users (all roles) — status changes shared by students, lecturers, etc.
// ---------------------------------------------------------------------

exports.getUsers = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 20, 100);
    const search = (req.query.search || "").trim();
    const role = req.query.role; // "student" | "lecturer" | "admin"

    const query = {};
    if (search) {
      query.$or = [
        { name: { $regex: search, $options: "i" } },
        { email: { $regex: search, $options: "i" } },
      ];
    }
    if (role && ["student", "lecturer", "admin"].includes(role)) {
      query.role = role;
    }

    const [users, total] = await Promise.all([
      User.find(query)
        .select("-password")
        .sort({ createdAt: -1 })
        .skip((page - 1) * limit)
        .limit(limit)
        .lean(),
      User.countDocuments(query),
    ]);

    res.status(200).json({
      status: "success",
      data: users,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching users: " + error.message });
  }
};

// Shared by both the Students page and the Users page — suspending a
// user is the same operation regardless of which table it's clicked from.
exports.setUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ status: "error", message: "Invalid user id" });
    }
    if (!["active", "suspended"].includes(status)) {
      return res.status(400).json({ status: "error", message: 'status must be "active" or "suspended"' });
    }

    // Prevent an admin from suspending their own account and locking
    // themselves out — a real incident waiting to happen otherwise.
    if (id === req.user.id) {
      return res.status(400).json({ status: "error", message: "You cannot change the status of your own account" });
    }

    const user = await User.findByIdAndUpdate(id, { status }, { new: true }).select("-password");
    if (!user) {
      return res.status(404).json({ status: "error", message: "User not found" });
    }

    await logAdminAction(req, {
      action: status === "suspended" ? "suspend_user" : "activate_user",
      targetType: "User",
      targetId: id,
      details: `Set status to "${status}" for ${user.email}`,
    });

    res.status(200).json({ status: "success", data: user });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error updating user status: " + error.message });
  }
};

// ---------------------------------------------------------------------
// Universities
// ---------------------------------------------------------------------

exports.getUniversities = async (req, res) => {
  try {
    const search = (req.query.search || "").trim();
    const verified = req.query.verified; // "true" | "false"

    const query = {};
    if (search) {
      query.name = { $regex: search, $options: "i" };
    }
    if (verified === "true" || verified === "false") {
      query.verified = verified === "true";
    }

    const universities = await University.find(query).sort({ createdAt: -1 }).lean();

    // Student count per university — real aggregation, not a fabricated
    // number. One extra query per list call; acceptable at this scale,
    // revisit with a $lookup aggregation if university counts grow large.
    const counts = await User.aggregate([
      { $match: { role: "student" } },
      { $group: { _id: "$universityId", count: { $sum: 1 } } },
    ]);
    const countMap = Object.fromEntries(counts.map((c) => [c._id, c.count]));

    const withCounts = universities.map((u) => ({
      ...u,
      studentCount: countMap[String(u._id)] || 0,
    }));

    res.status(200).json({ status: "success", data: withCounts });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching universities: " + error.message });
  }
};

exports.setUniversityVerified = async (req, res) => {
  try {
    const { id } = req.params;
    const { verified } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ status: "error", message: "Invalid university id" });
    }
    if (typeof verified !== "boolean") {
      return res.status(400).json({ status: "error", message: "verified must be true or false" });
    }

    const university = await University.findByIdAndUpdate(id, { verified }, { new: true });
    if (!university) {
      return res.status(404).json({ status: "error", message: "University not found" });
    }

    await logAdminAction(req, {
      action: verified ? "verify_university" : "unverify_university",
      targetType: "University",
      targetId: id,
      details: `Set verified to ${verified} for ${university.name}`,
    });

    res.status(200).json({ status: "success", data: university });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error updating university: " + error.message });
  }
};

// Duplicate check relies on the unique+collation index on
// University.name (see models/University.js) - the DB is the real
// source of truth for uniqueness, this catch just turns MongoDB's raw
// duplicate-key error into a message an admin can actually read.
exports.createUniversity = async (req, res) => {
  try {
    const { name, country, domainCode } = req.body;
    if (!name || !name.trim()) {
      return res.status(400).json({ status: "error", message: "name is required" });
    }

    const university = await University.create({
      name: name.trim(),
      country,
      domainCode,
    });

    await logAdminAction(req, {
      action: "create_university",
      targetType: "University",
      targetId: university._id,
      details: `Created university "${university.name}"`,
    });

    res.status(201).json({ status: "success", data: university });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ status: "error", message: "A university with this name already exists." });
    }
    res.status(500).json({ status: "error", message: "Error creating university: " + error.message });
  }
};

// Deleting a university is destructive to anything that references it
// (courses, enrolled students' universityId) - deliberately refuses if
// any course still references it, rather than silently orphaning data.
// An admin must reassign or remove those courses first.
exports.deleteUniversity = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ status: "error", message: "Invalid university id" });
    }

    const courseCount = await Course.countDocuments({ universityId: id });
    if (courseCount > 0) {
      return res.status(409).json({
        status: "error",
        message: `Cannot delete: ${courseCount} course(s) still reference this university. Remove or reassign them first.`,
      });
    }

    const university = await University.findByIdAndDelete(id);
    if (!university) {
      return res.status(404).json({ status: "error", message: "University not found" });
    }

    await logAdminAction(req, {
      action: "delete_university",
      targetType: "University",
      targetId: id,
      details: `Deleted university "${university.name}"`,
    });

    res.status(200).json({ status: "success", data: { deleted: true } });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error deleting university: " + error.message });
  }
};

// ---------------------------------------------------------------------
// Courses (admin view/management - the student/lecturer-facing
// createCourse in course.controller.js already exists and is
// role-gated; these are the admin equivalents: list-all-with-filter
// and delete, since course creation from the admin side uses the same
// underlying model and duplicate constraint)
// ---------------------------------------------------------------------

exports.getCourses = async (req, res) => {
  try {
    const universityId = req.query.universityId;
    const search = (req.query.search || "").trim();

    const query = {};
    if (universityId) query.universityId = universityId;
    if (search) {
      query.$or = [
        { title: { $regex: search, $options: "i" } },
        { code: { $regex: search, $options: "i" } },
      ];
    }

    const courses = await Course.find(query).sort({ createdAt: -1 }).lean();
    res.status(200).json({ status: "success", data: courses });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching courses: " + error.message });
  }
};

exports.createCourseAdmin = async (req, res) => {
  try {
    const { title, code, description, universityId } = req.body;
    if (!title || !code || !universityId) {
      return res.status(400).json({ status: "error", message: "title, code, and universityId are required" });
    }

    const course = await Course.create({ title, code, description, universityId });

    await logAdminAction(req, {
      action: "create_course",
      targetType: "Course",
      targetId: course._id,
      details: `Created course "${course.code}" for university ${universityId}`,
    });

    res.status(201).json({ status: "success", data: course });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ status: "error", message: "A course with this code already exists at this university." });
    }
    res.status(500).json({ status: "error", message: "Error creating course: " + error.message });
  }
};

// Refuses to delete if units still reference this course, same
// no-silent-orphan rule as deleteUniversity above.
exports.deleteCourse = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ status: "error", message: "Invalid course id" });
    }

    const unitCount = await Unit.countDocuments({ courseId: id });
    if (unitCount > 0) {
      return res.status(409).json({
        status: "error",
        message: `Cannot delete: ${unitCount} unit(s) still belong to this course. Remove them first.`,
      });
    }

    const course = await Course.findByIdAndDelete(id);
    if (!course) {
      return res.status(404).json({ status: "error", message: "Course not found" });
    }

    await logAdminAction(req, {
      action: "delete_course",
      targetType: "Course",
      targetId: id,
      details: `Deleted course "${course.code}"`,
    });

    res.status(200).json({ status: "success", data: { deleted: true } });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error deleting course: " + error.message });
  }
};

// ---------------------------------------------------------------------
// Units (admin view/management)
// ---------------------------------------------------------------------

exports.getUnits = async (req, res) => {
  try {
    const courseId = req.query.courseId;
    const query = {};
    if (courseId) query.courseId = courseId;

    const units = await Unit.find(query).sort({ order: 1, createdAt: -1 }).lean();
    res.status(200).json({ status: "success", data: units });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching units: " + error.message });
  }
};

exports.createUnitAdmin = async (req, res) => {
  try {
    const { title, description, order, courseId } = req.body;
    if (!title || !courseId) {
      return res.status(400).json({ status: "error", message: "title and courseId are required" });
    }

    const unit = await Unit.create({ title, description, order, courseId });

    await logAdminAction(req, {
      action: "create_unit",
      targetType: "Unit",
      targetId: unit._id,
      details: `Created unit "${unit.title}" for course ${courseId}`,
    });

    res.status(201).json({ status: "success", data: unit });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ status: "error", message: "A unit with this title already exists in this course." });
    }
    res.status(500).json({ status: "error", message: "Error creating unit: " + error.message });
  }
};

exports.deleteUnit = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ status: "error", message: "Invalid unit id" });
    }

    const unit = await Unit.findByIdAndDelete(id);
    if (!unit) {
      return res.status(404).json({ status: "error", message: "Unit not found" });
    }

    await logAdminAction(req, {
      action: "delete_unit",
      targetType: "Unit",
      targetId: id,
      details: `Deleted unit "${unit.title}"`,
    });

    res.status(200).json({ status: "success", data: { deleted: true } });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error deleting unit: " + error.message });
  }
};

// ---------------------------------------------------------------------
// Reports (backed by EmergencyReport — the only report-like model that
// currently exists in this backend; see final report notes)
// ---------------------------------------------------------------------

exports.getReports = async (req, res) => {
  try {
    const status = req.query.status; // "open" | "resolved" | "dismissed"
    const query = {};
    if (status && ["open", "resolved", "dismissed"].includes(status)) {
      query.status = status;
    }

    const reports = await EmergencyReport.find(query)
      .populate("userId", "name email")
      .sort({ createdAt: -1 })
      .lean();

    res.status(200).json({ status: "success", data: reports });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching reports: " + error.message });
  }
};

exports.setReportStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ status: "error", message: "Invalid report id" });
    }
    if (!["open", "resolved", "dismissed"].includes(status)) {
      return res.status(400).json({ status: "error", message: "Invalid status" });
    }

    const report = await EmergencyReport.findByIdAndUpdate(id, { status }, { new: true });
    if (!report) {
      return res.status(404).json({ status: "error", message: "Report not found" });
    }

    await logAdminAction(req, {
      action: `report_${status}`,
      targetType: "EmergencyReport",
      targetId: id,
    });

    res.status(200).json({ status: "success", data: report });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error updating report: " + error.message });
  }
};

// ---------------------------------------------------------------------
// Audit logs — read only, never editable by admins (see routes: no
// PUT/DELETE is registered for this resource, by design)
// ---------------------------------------------------------------------

exports.getAuditLogs = async (req, res) => {
  try {
    const page = Math.max(parseInt(req.query.page) || 1, 1);
    const limit = Math.min(parseInt(req.query.limit) || 25, 100);

    const [logs, total] = await Promise.all([
      AuditLog.find({}).sort({ createdAt: -1 }).skip((page - 1) * limit).limit(limit).lean(),
      AuditLog.countDocuments({}),
    ]);

    res.status(200).json({
      status: "success",
      data: logs,
      pagination: { page, limit, total, totalPages: Math.ceil(total / limit) },
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching audit logs: " + error.message });
  }
};

// ---------------------------------------------------------------------
// Analytics
// ---------------------------------------------------------------------

// Buckets registrations by day, week, or month. Uses $dateToString rather
// than $dateTrunc (Mongo 5.0+ only) so this works on any MongoDB Atlas
// tier without assuming a server version we haven't confirmed.
const BUCKET_FORMATS = {
  day: "%Y-%m-%d",
  week: "%G-W%V", // ISO week
  month: "%Y-%m",
};

exports.getUserGrowth = async (req, res) => {
  try {
    const granularity = ["day", "week", "month"].includes(req.query.granularity)
      ? req.query.granularity
      : "day";
    const format = BUCKET_FORMATS[granularity];

    // Default window: last 30 days for "day", else let the data speak
    // for itself rather than picking an arbitrary long window.
    const days = Math.min(parseInt(req.query.days) || 30, 365);
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await User.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: {
            bucket: { $dateToString: { format, date: "$createdAt" } },
            role: "$role",
          },
          count: { $sum: 1 },
        },
      },
      { $sort: { "_id.bucket": 1 } },
    ]);

    // Reshape from Mongo's grouped rows into one row per bucket with
    // per-role counts, which is what a stacked/line chart actually wants.
    const buckets = {};
    for (const row of rows) {
      const key = row._id.bucket;
      if (!buckets[key]) buckets[key] = { bucket: key, student: 0, lecturer: 0, admin: 0, total: 0 };
      buckets[key][row._id.role] = (buckets[key][row._id.role] || 0) + row.count;
      buckets[key].total += row.count;
    }

    res.status(200).json({
      status: "success",
      data: Object.values(buckets).sort((a, b) => a.bucket.localeCompare(b.bucket)),
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error computing user growth: " + error.message });
  }
};

exports.getUniversityGrowth = async (req, res) => {
  try {
    const granularity = ["day", "week", "month"].includes(req.query.granularity)
      ? req.query.granularity
      : "month";
    const format = BUCKET_FORMATS[granularity];

    const rows = await University.aggregate([
      {
        $group: {
          _id: { $dateToString: { format, date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.status(200).json({
      status: "success",
      data: rows.map((r) => ({ bucket: r._id, count: r.count })),
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error computing university growth: " + error.message });
  }
};

// ---------------------------------------------------------------------
// Notifications (admin-facing) — see Notification model for why this is
// scoped to admin-relevant events only, not a general pub/sub system.
// ---------------------------------------------------------------------

exports.getNotifications = async (req, res) => {
  try {
    const unreadOnly = req.query.unread === "true";
    const query = { recipientId: req.user.id };
    if (unreadOnly) query.read = false;

    const [notifications, unreadCount] = await Promise.all([
      Notification.find(query).sort({ createdAt: -1 }).limit(50).lean(),
      Notification.countDocuments({ recipientId: req.user.id, read: false }),
    ]);

    res.status(200).json({ status: "success", data: notifications, unreadCount });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching notifications: " + error.message });
  }
};

exports.markNotificationRead = async (req, res) => {
  try {
    const { id } = req.params;
    if (!mongoose.Types.ObjectId.isValid(id)) {
      return res.status(400).json({ status: "error", message: "Invalid notification id" });
    }

    // Scoped to the requesting admin's own id — an admin should only
    // ever be able to mark their own notifications read, not anyone's.
    const notification = await Notification.findOneAndUpdate(
      { _id: id, recipientId: req.user.id },
      { read: true },
      { new: true }
    );
    if (!notification) {
      return res.status(404).json({ status: "error", message: "Notification not found" });
    }

    res.status(200).json({ status: "success", data: notification });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error updating notification: " + error.message });
  }
};

exports.getSystemHealth = async (req, res) => {
  const dbState = mongoose.connection.readyState; // 0=disconnected,1=connected,2=connecting,3=disconnecting
  const dbStatus = dbState === 1 ? "healthy" : dbState === 2 ? "degraded" : "offline";

  res.status(200).json({
    status: "success",
    data: {
      backend: "healthy", // if this handler ran at all, the backend process is up
      database: dbStatus,
      authService: "healthy", // this route itself required a valid token + admin role to reach
      checkedAt: new Date().toISOString(),
    },
  });
};
