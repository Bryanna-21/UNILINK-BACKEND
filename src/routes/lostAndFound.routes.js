const router = require("express").Router();
const ctrl = require("../controllers/lostAndFound.controller");
const auth = require("../middleware/auth.middleware");
const { uploadImage } = require("../middleware/upload.middleware");

router.get("/", auth, ctrl.getLostItems);
router.post("/", auth, uploadImage.single("image"), ctrl.reportItem);
router.patch("/:id/resolve", auth, ctrl.markResolved);

module.exports = router;
