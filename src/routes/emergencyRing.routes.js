const router = require("express").Router();
const auth = require("../middleware/auth.middleware");
const ctrl = require("../controllers/emergencyRing.controller");

// Mounted BEFORE emergency.routes.js in app.js, so these two paths are answered here. The old
// GET /contacts returned a fixed list with a made-up campus security number; this one returns the
// real numbers for the caller's country.
router.get("/contacts", auth, ctrl.getContacts);
router.get("/alerts/active", auth, ctrl.getActiveAlerts);

module.exports = router;
