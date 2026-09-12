const router = require("express").Router();
const ctrl = require("../controllers/profile.controller");
const auth = require("../middleware/auth.middleware");
const { uploadDocument, uploadImage } = require("../middleware/upload.middleware");

router.get("/portfolio", auth, ctrl.getMyPortfolio);
router.patch("/portfolio", auth, ctrl.updateMyPortfolio);
router.post("/portfolio/resume", auth, uploadDocument.single("file"), ctrl.uploadResume);
router.post("/portfolio/certificates", auth, uploadDocument.single("file"), ctrl.addCertificate);
router.get("/achievements", auth, ctrl.getAchievementsForUser);
router.get("/achievements/:userId", auth, ctrl.getAchievementsForUser);
router.get("/summary/:userId", auth, ctrl.getUserSummary);

// Core identity fields (name, bio, phone) — distinct from the
// /portfolio routes above, which are career/academic extension data.
// PUT rather than PATCH to match mobile's existing edit.tsx, which
// was already written against PUT /users/profile before this route
// existed anywhere; kept as PUT here rather than making mobile change
// its verb for no functional reason.
router.put("/me", auth, ctrl.updateMyProfile);
router.put("/me/avatar", auth, uploadImage.single("avatar"), ctrl.uploadAvatar);
router.put("/me/cover", auth, uploadImage.single("cover"), ctrl.uploadCover);

module.exports = router;