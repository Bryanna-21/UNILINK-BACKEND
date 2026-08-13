const router = require("express").Router();
const ctrl = require("../controllers/profile.controller");
const auth = require("../middleware/auth.middleware");
const { uploadDocument } = require("../middleware/upload.middleware");

router.get("/portfolio", auth, ctrl.getMyPortfolio);
router.patch("/portfolio", auth, ctrl.updateMyPortfolio);
router.post("/portfolio/resume", auth, uploadDocument.single("file"), ctrl.uploadResume);
router.post("/portfolio/certificates", auth, uploadDocument.single("file"), ctrl.addCertificate);
router.get("/achievements", auth, ctrl.getAchievementsForUser);
router.get("/achievements/:userId", auth, ctrl.getAchievementsForUser);

module.exports = router;
