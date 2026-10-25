const router = require("express").Router();
const ctrl = require("../controllers/legal.controller");
const auth = require("../middleware/auth.middleware");

// PUBLIC: the notice must be readable before anyone has an account.
router.get("/privacy", ctrl.getPrivacy);

// Signed in: has this person acknowledged the current version, and record that they have.
router.get("/status", auth, ctrl.getStatus);
router.post("/acknowledge", auth, ctrl.acknowledge);

module.exports = router;
