const router = require("express").Router();
const ctrl = require("../controllers/post.controller");
const auth = require("../middleware/auth.middleware");

router.post("/create", auth, ctrl.createPost);
router.get("/feed", auth, ctrl.getFeed);
router.post("/like/:id", auth, ctrl.likePost);

module.exports = router;
