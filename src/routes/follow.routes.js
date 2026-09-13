const router = require("express").Router();
const ctrl = require("../controllers/follow.controller");
const auth = require("../middleware/auth.middleware");

router.post("/:userId", auth, ctrl.followUser);
router.delete("/:userId", auth, ctrl.unfollowUser);
router.get("/:userId/followers", auth, ctrl.getFollowers);
router.get("/:userId/following", auth, ctrl.getFollowing);
router.get("/:userId/status", auth, ctrl.getFollowStatus);

module.exports = router;
