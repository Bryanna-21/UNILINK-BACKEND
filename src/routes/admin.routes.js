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
// UNIVERSITY MANAGEMENT - Superadmin Only
// ============================================================

// POST /api/admin/universities - Create university
router.post("/universities", authenticate, requireSuperadmin, createUniversity);

module.exports = router;
