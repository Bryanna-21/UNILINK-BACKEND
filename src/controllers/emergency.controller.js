const mongoose = require("mongoose");
const EmergencyReport = require("../models/EmergencyReport");
const Course = require("../models/Course");
const notifyAdmins = require("../middleware/notifyAdmins.middleware");
const logAction = require("../middleware/auditLog.helper");

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

const toLecturerPreview = (report) => ({
  _id: report._id,
  type: report.type,
  status: report.status,
  priority: report.priority,
  courseId: report.courseId,
  location: report.location,
  createdAt: report.createdAt,
  assignedTo: report.assignedTo,
});

const toStudentView = (report) => ({
  _id: report._id,
  type: report.type,
  message: report.message,
  location: report.location,
  status: report.status,
  createdAt: report.createdAt,
  resolvedAt: report.resolvedAt,
});

exports.reportEmergency = async (req, res) => {
  try {
    const { type, message, location, courseId } = req.body;

    if (!type || !EmergencyReport.VALID_TYPES.includes(type)) {
      return res.status(400).json({
        status: "error",
        message: `type must be one of: ${EmergencyReport.VALID_TYPES.join(", ")}`,
      });
    }

    let verifiedCourseId = null;
    if (courseId) {
      if (!isValidId(courseId)) {
        return res.status(400).json({ status: "error", message: "Invalid course id" });
      }
      const course = await Course.findById(courseId);
      if (course && course.enrolledStudentIds.includes(req.user.id)) {
        verifiedCourseId = courseId;
      }
    }

    const report = await EmergencyReport.create({
      userId: req.user.id,
      universityId: req.user.universityId,
      courseId: verifiedCourseId,
      type,
      message,
      location,
    });

    notifyAdmins({
      type: "new_emergency_report",
      title: `New ${type} report`,
      message: message ? message.slice(0, 140) : "No additional details provided.",
      link: "/reports",
    });

    await logAction(req, {
      action: "create_emergency_report",
      targetType: "EmergencyReport",
      targetId: report._id,
    });

    res.status(201).json({ status: "success", data: toStudentView(report) });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to report emergency: " + error.message,
    });
  }
};

exports.getMyReports = async (req, res) => {
  try {
    const reports = await EmergencyReport.find({ userId: req.user.id }).sort({ createdAt: -1 });
    res.status(200).json({
      status: "success",
      count: reports.length,
      data: reports.map(toStudentView),
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching your reports: " + error.message });
  }
};

exports.getAuthorizedReports = async (req, res) => {
  try {
    if (req.user.role === "admin") {
      const reports = await EmergencyReport.find({ universityId: req.user.universityId })
        .sort({ createdAt: -1 });
      return res.status(200).json({ status: "success", count: reports.length, data: reports });
    }

    if (req.user.role === "lecturer") {
      const myCourses = await Course.find({ lecturerId: req.user.id }).select("_id").lean();
      const myCourseIds = myCourses.map((c) => c._id.toString());

      const reports = await EmergencyReport.find({
        type: { $nin: EmergencyReport.RESTRICTED_TYPES },
        $or: [
          { courseId: { $in: myCourseIds } },
          { courseId: null, universityId: req.user.universityId },
        ],
      }).sort({ createdAt: -1 });

      await logAction(req, {
        action: "view_authorized_reports",
        targetType: "EmergencyReport",
        targetId: "list",
        details: `Viewed ${reports.length} report(s)`,
      });

      return res.status(200).json({
        status: "success",
        count: reports.length,
        data: reports.map(toLecturerPreview),
      });
    }

    await logAction(req, {
      action: "view_authorized_reports",
      targetType: "EmergencyReport",
      targetId: "list",
      result: "failure",
      details: `Denied - role '${req.user.role}' is not authorized to view reports`,
    });

    return res.status(403).json({ status: "error", message: "You are not authorized to view emergency reports" });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching reports: " + error.message });
  }
};

const lecturerIsAuthorizedFor = async (report, userId, universityId) => {
  if (EmergencyReport.RESTRICTED_TYPES.includes(report.type)) return false;
  if (report.courseId) {
    const course = await Course.findById(report.courseId);
    return course?.lecturerId === userId;
  }
  return report.universityId === universityId;
};

// Shared by every write action below: verifies role + scope
// authorization, and — new — logs a failure entry on EVERY denial
// path, not just successes. A rejected attempt against a restricted
// (e.g. abuse) report is arguably the single most security-relevant
// event this audit trail exists to capture, more so than the
// successful actions.
const authorizeReportAction = async (req, res, report, action) => {
  if (req.user.role !== "lecturer" && req.user.role !== "admin") {
    await logAction(req, {
      action,
      targetType: "EmergencyReport",
      targetId: report._id,
      result: "failure",
      details: `Denied - role '${req.user.role}' is not lecturer or admin`,
    });
    res.status(403).json({ status: "error", message: "Not authorized" });
    return false;
  }
  if (req.user.role === "lecturer") {
    const authorized = await lecturerIsAuthorizedFor(report, req.user.id, req.user.universityId);
    if (!authorized) {
      await logAction(req, {
        action,
        targetType: "EmergencyReport",
        targetId: report._id,
        result: "failure",
        details: EmergencyReport.RESTRICTED_TYPES.includes(report.type)
          ? "Denied - restricted report type"
          : "Denied - report outside lecturer's authorized scope",
      });
      res.status(403).json({ status: "error", message: "You are not authorized to act on this report" });
      return false;
    }
  }
  return true;
};

exports.acknowledgeReport = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ status: "error", message: "Invalid report id" });
    }

    const report = await EmergencyReport.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ status: "error", message: "Report not found" });
    }

    const authorized = await authorizeReportAction(req, res, report, "acknowledge_emergency_report");
    if (!authorized) return;

    if (report.status === "OPEN") {
      report.status = "ACKNOWLEDGED";
      report.assignedTo = req.user.id;
      await report.save();
    }

    await logAction(req, {
      action: "acknowledge_emergency_report",
      targetType: "EmergencyReport",
      targetId: report._id,
    });

    res.status(200).json({ status: "success", data: report });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error acknowledging report: " + error.message });
  }
};

exports.respondToReport = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ status: "error", message: "Invalid report id" });
    }

    const { note } = req.body;
    if (!note || !note.trim()) {
      return res.status(400).json({ status: "error", message: "note is required" });
    }

    const report = await EmergencyReport.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ status: "error", message: "Report not found" });
    }

    const authorized = await authorizeReportAction(req, res, report, "respond_to_emergency_report");
    if (!authorized) return;

    report.internalNotes.push({ authorId: req.user.id, note: note.trim() });
    if (["OPEN", "ACKNOWLEDGED"].includes(report.status)) {
      report.status = "RESPONDING";
      report.assignedTo = req.user.id;
    }
    await report.save();

    await logAction(req, {
      action: "respond_to_emergency_report",
      targetType: "EmergencyReport",
      targetId: report._id,
    });

    res.status(200).json({ status: "success", data: report });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error responding to report: " + error.message });
  }
};

exports.escalateReport = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ status: "error", message: "Invalid report id" });
    }

    const report = await EmergencyReport.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ status: "error", message: "Report not found" });
    }

    const authorized = await authorizeReportAction(req, res, report, "escalate_emergency_report");
    if (!authorized) return;

    report.status = "ESCALATED";
    await report.save();

    notifyAdmins({
      type: "emergency_report_escalated",
      title: `Escalated: ${report.type} report`,
      message: "A report has been escalated and needs admin attention.",
      link: "/reports",
    });

    await logAction(req, {
      action: "escalate_emergency_report",
      targetType: "EmergencyReport",
      targetId: report._id,
    });

    res.status(200).json({ status: "success", data: report });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error escalating report: " + error.message });
  }
};

exports.updateReportStatus = async (req, res) => {
  try {
    if (req.user.role !== "admin") {
      if (!isValidId(req.params.id)) {
        return res.status(400).json({ status: "error", message: "Invalid report id" });
      }
      await logAction(req, {
        action: "resolve_emergency_report",
        targetType: "EmergencyReport",
        targetId: req.params.id,
        result: "failure",
        details: `Denied - role '${req.user.role}' is not admin`,
      });
      return res.status(403).json({ status: "error", message: "Only admins can resolve or dismiss reports" });
    }
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ status: "error", message: "Invalid report id" });
    }

    const { status } = req.body;
    if (!["RESOLVED", "DISMISSED"].includes(status)) {
      return res.status(400).json({ status: "error", message: "status must be RESOLVED or DISMISSED" });
    }

    const report = await EmergencyReport.findById(req.params.id);
    if (!report) {
      return res.status(404).json({ status: "error", message: "Report not found" });
    }

    report.status = status;
    report.resolvedAt = new Date();
    report.resolvedBy = req.user.id;
    await report.save();

    await logAction(req, {
      action: "resolve_emergency_report",
      targetType: "EmergencyReport",
      targetId: report._id,
      details: status,
    });

    res.status(200).json({ status: "success", data: report });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error updating report status: " + error.message });
  }
};

exports.getContacts = async (req, res) => {
  res.status(200).json({
    status: "success",
    data: [
      { name: "National Emergency", phone: "112" },
      { name: "Ambulance", phone: "999" },
      { name: "Campus Security", phone: "0700000000" },
    ],
  });
};

exports.requestHelp = async (req, res) => {
  res.status(200).json({
    status: "success",
    message: "Help request received. Support will reach out.",
  });
};
