const router = require("express").Router();
const auth = require("../middleware/auth.middleware");
const ctrl = require("../controllers/trustedContacts.controller");

// Mounted at /api/profile BEFORE profile.routes.js, so these two answer first.
router.post("/trusted-contacts", auth, ctrl.add);
router.delete("/trusted-contacts/:contactId", auth, ctrl.remove);

module.exports = router;
