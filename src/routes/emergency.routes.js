const router = require("express").Router();
const ctrl = require("../controllers/emergency.controller");
const auth = require("../middleware/auth.middleware");

// Student-facing
router.post("/report", auth, ctrl.reportEmergency);
router.get("/my-reports", auth, ctrl.getMyReports);

// Lecturer/admin-facing - authorization computed server-side inside
// each controller function from the caller's role and real
// relationships (Course.lecturerId, universityId), never from a
// client-supplied filter.
router.get("/reports", auth, ctrl.getAuthorizedReports);
router.patch("/reports/:id/acknowledge", auth, ctrl.acknowledgeReport);
router.post("/reports/:id/respond", auth, ctrl.respondToReport);
router.patch("/reports/:id/escalate", auth, ctrl.escalateReport);

// Admin-only (enforced inside the controller, not just by route
// placement)
router.patch("/reports/:id/status", auth, ctrl.updateReportStatus);

router.get("/contacts", auth, ctrl.getContacts);
router.post("/help", auth, ctrl.requestHelp);

module.exports = router;
