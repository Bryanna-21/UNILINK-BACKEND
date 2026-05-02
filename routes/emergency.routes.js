const router = require("express").Router();
const ctrl = require("../controllers/emergency.controller");
const auth = require("../middleware/auth");

router.post("/report", auth, ctrl.reportEmergency);
router.get("/contacts", auth, ctrl.getContacts);
router.post("/help", auth, ctrl.requestHelp);

module.exports = router;
