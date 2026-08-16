const router = require("express").Router();
const ctrl = require("../controllers/admin.controller");
const auth = require("../middleware/auth.middleware");
const requireRole = require("../middleware/role.middleware");

// Every route in this file requires BOTH a valid token (auth) AND the
// admin role (requireRole). This is the actual security boundary for
// the entire Admin Panel — see role.middleware.js for why the frontend
// alone can never be trusted for this.
router.use(auth, requireRole("admin"));

// Dashboard
router.get("/dashboard/stats", ctrl.getDashboardStats);
router.get("/dashboard/recent-users", ctrl.getRecentUsers);

// Students
router.get("/students", ctrl.getStudents);
router.get("/students/:id", ctrl.getStudentById);

// Users (all roles)
router.get("/users", ctrl.getUsers);
router.patch("/users/:id/status", ctrl.setUserStatus);

// Universities
router.get("/universities", ctrl.getUniversities);
router.post("/universities", ctrl.createUniversity);
router.patch("/universities/:id/verified", ctrl.setUniversityVerified);
router.delete("/universities/:id", ctrl.deleteUniversity);

// Courses
router.get("/courses", ctrl.getCourses);
router.post("/courses", ctrl.createCourseAdmin);
router.delete("/courses/:id", ctrl.deleteCourse);

// Units
router.get("/units", ctrl.getUnits);
router.post("/units", ctrl.createUnitAdmin);
router.delete("/units/:id", ctrl.deleteUnit);

// Reports
router.get("/reports", ctrl.getReports);
router.patch("/reports/:id/status", ctrl.setReportStatus);

// Analytics
router.get("/analytics/user-growth", ctrl.getUserGrowth);
router.get("/analytics/university-growth", ctrl.getUniversityGrowth);

// Notifications (admin's own)
router.get("/notifications", ctrl.getNotifications);
router.patch("/notifications/:id/read", ctrl.markNotificationRead);

// Audit logs — intentionally read-only. No POST/PUT/DELETE here: audit
// logs must never be editable by the admins they might implicate.
router.get("/audit-logs", ctrl.getAuditLogs);

// System health
router.get("/system-health", ctrl.getSystemHealth);

module.exports = router;
