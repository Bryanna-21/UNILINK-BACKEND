const router = require("express").Router();
const ctrl = require("../controllers/exam.controller");
const auth = require("../middleware/auth.middleware");

// Route order matters — Express matches in registration order, and a
// dynamic /:id route placed before a specific path (e.g. /results/me
// or /lecturer) would swallow that request with id="results" or
// id="lecturer". Every specific path below is registered before /:id.

// ── Student-facing ──────────────────────────────────────────────
router.get("/", auth, ctrl.getStudentExams);
router.get("/results/me", auth, ctrl.getStudentResults);
router.post("/:id/submit", auth, ctrl.submitExam);

// ── Lecturer-facing ──────────────────────────────────────────────
// Role/ownership checks are enforced inside each controller function,
// not here — auth.middleware.js only verifies the token and session
// validity, it doesn't gate by role.
router.get("/lecturer", auth, ctrl.getLecturerExams);
router.post("/", auth, ctrl.createExam);
router.put("/:id", auth, ctrl.updateExam);
router.patch("/:id/publish", auth, ctrl.publishExam);
router.patch("/:id/close", auth, ctrl.closeExam);
router.post("/:id/duplicate", auth, ctrl.duplicateExam);
router.delete("/:id", auth, ctrl.deleteExam);

// ── Shared / must stay after the above ────────────────────────────
router.get("/:id", auth, ctrl.getExamById);

module.exports = router;
