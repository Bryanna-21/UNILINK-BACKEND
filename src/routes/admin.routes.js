const express = require("express");
const router = express.Router();
const {
  createAdmin,
  listAdmins,
  updateAdmin,
  deleteAdmin,
  createUnit,
  listUnits,
  updateUnit,
  deleteUnit,
  createUniversity,
  getAdminNotifications,
  markAdminNotificationRead,
  listUsers,
  getDashboardStats,
  listStudents,
  getStudent,
  updateUserStatus,
  listUniversities,
  setUniversityVerified,
  getUserGrowth,
  getUniversityGrowth,
  listAuditLogs,
  getSystemHealth,
  createFaculty,
  listFaculties,
  updateFaculty,
  deleteFaculty,
  createDepartment,
  listDepartments,
  updateDepartment,
  deleteDepartment,
  createCampus,
  listCampuses,
  updateCampus,
  deleteCampus,
} = require("../controllers/admin.controller");
const { requireSuperadmin, requireAdminOrSuperadmin } = require("../middleware/roleGuard");
const authenticate = require("../middleware/auth.middleware"); // Assuming you have auth middleware

// ============================================================
// USER DIRECTORY / DASHBOARD - Admin or Superadmin
// ============================================================
// Same reasoning as notifications above: browsing users and viewing
// dashboard counts are ordinary admin actions, not superadmin-only
// ones like creating another admin or a university.

// GET /api/admin/users - Every user, any role, with optional
// ?search= and ?role= filters
router.get("/users", authenticate, requireAdminOrSuperadmin, listUsers);

// GET /api/admin/dashboard-stats
router.get("/dashboard-stats", authenticate, requireAdminOrSuperadmin, getDashboardStats);

// GET /api/admin/students - student-only directory with admissionNumber
router.get("/students", authenticate, requireAdminOrSuperadmin, listStudents);

// GET /api/admin/students/:id - single student, includes trustedContacts
router.get("/students/:id", authenticate, requireAdminOrSuperadmin, getStudent);

// PATCH /api/admin/users/:id/status - suspend/activate. requireSuperadmin,
// not requireAdminOrSuperadmin: unlike browsing (listUsers/listStudents),
// suspending an account is a state-changing action in the same class as
// admin/unit create-delete below, not ordinary admin work.
router.patch("/users/:id/status", authenticate, requireSuperadmin, updateUserStatus);

// ============================================================
// ADMIN NOTIFICATIONS - Admin or Superadmin
// ============================================================
// requireAdminOrSuperadmin, not requireSuperadmin like the rest of
// this file: notifyAdmins.middleware.js fans these out to every
// User with role "admin" (not superadmin), so gating the read side
// to superadmin-only would mean the admins these are written for
// could never see their own notifications.
//
// Note: as currently wired, superadmins never receive these rows in
// the first place (notifyAdmins.middleware.js queries role "admin"
// only) - this route will just correctly return an empty list for
// them. Flagging in case that's not the intended split.

// GET /api/admin/notifications - This admin's own notifications + unread count
router.get("/notifications", authenticate, requireAdminOrSuperadmin, getAdminNotifications);

// PATCH /api/admin/notifications/:id/read - Mark one as read
router.patch("/notifications/:id/read", authenticate, requireAdminOrSuperadmin, markAdminNotificationRead);

// ============================================================
// ADMIN MANAGEMENT - Superadmin Only
// ============================================================

// POST /api/admin/admins - Create admin
router.post("/admins", authenticate, requireSuperadmin, createAdmin);

// GET /api/admin/admins - List admins
router.get("/admins", authenticate, requireSuperadmin, listAdmins);

// PUT /api/admin/admins/:id - Update admin
router.put("/admins/:id", authenticate, requireSuperadmin, updateAdmin);

// DELETE /api/admin/admins/:id - Delete admin
router.delete("/admins/:id", authenticate, requireSuperadmin, deleteAdmin);

// ============================================================
// UNIT MANAGEMENT - Superadmin Only
// ============================================================

// POST /api/admin/units - Create unit
router.post("/units", authenticate, requireSuperadmin, createUnit);

// GET /api/admin/units - List units
router.get("/units", authenticate, requireSuperadmin, listUnits);

// PUT /api/admin/units/:id - Update unit
router.put("/units/:id", authenticate, requireSuperadmin, updateUnit);

// DELETE /api/admin/units/:id - Delete unit
router.delete("/units/:id", authenticate, requireSuperadmin, deleteUnit);

// ============================================================
// FACULTY MANAGEMENT - Superadmin Only
// ============================================================

router.post("/faculties", authenticate, requireSuperadmin, createFaculty);
router.get("/faculties", authenticate, requireSuperadmin, listFaculties);
router.put("/faculties/:id", authenticate, requireSuperadmin, updateFaculty);
router.delete("/faculties/:id", authenticate, requireSuperadmin, deleteFaculty);

// ============================================================
// DEPARTMENT MANAGEMENT - Superadmin Only
// ============================================================

router.post("/departments", authenticate, requireSuperadmin, createDepartment);
router.get("/departments", authenticate, requireSuperadmin, listDepartments);
router.put("/departments/:id", authenticate, requireSuperadmin, updateDepartment);
router.delete("/departments/:id", authenticate, requireSuperadmin, deleteDepartment);

// ============================================================
// CAMPUS MANAGEMENT - Superadmin Only
// ============================================================

router.post("/campuses", authenticate, requireSuperadmin, createCampus);
router.get("/campuses", authenticate, requireSuperadmin, listCampuses);
router.put("/campuses/:id", authenticate, requireSuperadmin, updateCampus);
router.delete("/campuses/:id", authenticate, requireSuperadmin, deleteCampus);

// ============================================================
// UNIVERSITY MANAGEMENT - Superadmin Only
// ============================================================

// GET /api/admin/universities - List/search universities
router.get("/universities", authenticate, requireSuperadmin, listUniversities);

// POST /api/admin/universities - Create university
router.post("/universities", authenticate, requireSuperadmin, createUniversity);

// PATCH /api/admin/universities/:id/verified - Verify/unverify
router.patch("/universities/:id/verified", authenticate, requireSuperadmin, setUniversityVerified);

// ============================================================
// ANALYTICS - Superadmin Only
// ============================================================

// GET /api/admin/analytics/user-growth?days=30
router.get("/analytics/user-growth", authenticate, requireSuperadmin, getUserGrowth);

// GET /api/admin/analytics/university-growth?days=30
router.get("/analytics/university-growth", authenticate, requireSuperadmin, getUniversityGrowth);

// ============================================================
// AUDIT LOGS - Superadmin Only
// ============================================================
// Superadmin-only, not requireAdminOrSuperadmin: these logs include
// every admin's actions against each other (ADMIN_CREATE, ADMIN_DELETE,
// etc.), which an ordinary admin should not be able to browse.

// GET /api/admin/audit-logs?action=&targetType=&adminId=&page=&limit=
router.get("/audit-logs", authenticate, requireSuperadmin, listAuditLogs);

// ============================================================
// SYSTEM HEALTH - Admin or Superadmin
// ============================================================
// requireAdminOrSuperadmin, not requireSuperadmin: read-only operational
// visibility (is the DB up, how many users), same tier as dashboard-stats
// above, not a superadmin-only management action.

// GET /api/admin/system-health
router.get("/system-health", authenticate, requireAdminOrSuperadmin, getSystemHealth);

module.exports = router;
