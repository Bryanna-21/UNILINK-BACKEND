const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth.middleware");
const c = require("../controllers/enforcement.controller");

// Mounted at /api/safety. `allowRestricted`: a suspended or terminated person must be able to
// appeal, which is the whole point of the appeal.
router.post("/actions/:actionId/appeal", auth.allowRestricted, c.submitAppeal);

module.exports = router;
