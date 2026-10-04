const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth.middleware");
const ctrl = require("../controllers/safety.controller");

// PUBLIC: the standards and the reporting vocabulary must be readable without an account
// (and by the app stores' reviewers).
router.get("/config", ctrl.getConfig);
router.get("/standards", ctrl.getStandards);

// Signed in
router.post("/reports", auth, ctrl.createReport);
router.get("/reports/mine", auth, ctrl.myReports);
router.post("/standards/accept", auth, ctrl.acceptStandards);

// Signed in, INCLUDING suspended and terminated accounts: they must still be able to see
// their standing and (in the next package) appeal.
router.get("/me/standing", auth.allowRestricted, ctrl.myStanding);

module.exports = router;
