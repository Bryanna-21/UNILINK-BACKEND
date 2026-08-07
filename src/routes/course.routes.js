const router = require("express").Router();
const ctrl = require("../controllers/course.controller");
const resourcesCtrl = require("../controllers/resources.controller");
const auth = require("../middleware/auth.middleware");
const { uploadDocument } = require("../middleware/upload.middleware");

// Courses
router.get("/", auth, ctrl.getCourses);
router.post("/", auth, ctrl.createCourse);
router.get("/:id", auth, ctrl.getCourseById);
router.post("/:id/enroll", auth, ctrl.enrollInCourse);

// Units
router.get("/:courseId/units", auth, ctrl.getUnitsForCourse);
router.post("/:courseId/units", auth, ctrl.createUnit);

// Assignments
router.get("/:courseId/assignments", auth, ctrl.getAssignmentsForCourse);
router.post("/:courseId/assignments", auth, ctrl.createAssignment);
router.get("/assignments/:id", auth, ctrl.getAssignmentById);

// Submissions
router.post("/assignments/:assignmentId/submit", auth, ctrl.submitAssignment);
router.get("/assignments/:assignmentId/my-submission", auth, ctrl.getMySubmission);
router.get("/assignments/:assignmentId/submissions", auth, ctrl.getSubmissionsForAssignment);
router.patch("/submissions/:id/grade", auth, ctrl.gradeSubmission);

// CATs
router.get("/:courseId/cats", auth, ctrl.getCatsForCourse);
router.post("/:courseId/cats", auth, ctrl.createCat);
router.get("/cats/:id", auth, ctrl.getCatById);

// Results
router.post("/cats/:catId/results", auth, ctrl.publishResult);
router.get("/cats/:catId/my-result", auth, ctrl.getMyResultForCat);

// Notes
router.get("/:courseId/notes", auth, resourcesCtrl.getNotesForCourse);
router.post("/:courseId/notes", auth, uploadDocument.single("file"), resourcesCtrl.uploadNote);

// Past Papers
router.get("/:courseId/past-papers", auth, resourcesCtrl.getPastPapersForCourse);
router.post("/:courseId/past-papers", auth, uploadDocument.single("file"), resourcesCtrl.uploadPastPaper);

module.exports = router;
