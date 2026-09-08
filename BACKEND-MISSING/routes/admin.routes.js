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
} = require("../controllers/admin.controller");
const { requireSuperadmin } = require("../middleware/roleGuard");
const authenticate = require("../middleware/auth"); // Assuming you have auth middleware

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
