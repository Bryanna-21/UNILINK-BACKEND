const router = require("express").Router();
const ctrl = require("../controllers/catalogue.controller");
const auth = require("../middleware/auth.middleware");

// Browse: institutions by type, an institution's courses, a course's units grouped by year and semester.
router.get("/institutions", auth, ctrl.institutions);
router.get("/institutions/:id/courses", auth, ctrl.institutionCourses);
router.get("/courses/:courseId/units", auth, ctrl.courseUnits);

// The signed-in student's own units (Academics tab -> My Units).
router.get("/my-units", auth, ctrl.myUnits);

// Superadmin only (checked against the database role, not the token): import / correct a course and its units,
// and mark a course verified once the client has confirmed it against the institution's curriculum.
router.post("/admin/import", auth, ctrl.adminImport);
router.patch("/admin/courses/:courseId/verify", auth, ctrl.adminVerify);

module.exports = router;
