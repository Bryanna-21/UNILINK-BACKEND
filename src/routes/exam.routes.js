const router = require("express").Router();
const ctrl = require("../controllers/exam.controller");
const auth = require("../middleware/auth.middleware");

// Student-facing only — lecturer authoring, grading, and analytics
// routes are deliberately not built yet (separate, larger piece of
// work). These match exactly what Student/Exams.js, TakeExam.js,
// and Results.js call.
//
// IMPORTANT: /results/me must be registered before /:id — Express
// matches routes in registration order, and a dynamic /:id route
// placed first would swallow /results/me requests with id="results".
router.get("/", auth, ctrl.getStudentExams);
router.get("/results/me", auth, ctrl.getStudentResults);
router.get("/:id", auth, ctrl.getExamById);
router.post("/:id/submit", auth, ctrl.submitExam);

module.exports = router;
