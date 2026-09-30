const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth.middleware");
const ctrl = require("../controllers/community_v2.controller");

router.get("/", auth, ctrl.getCommunities);
router.post("/", auth, ctrl.createCommunity);
router.post("/:communityId/join", auth, ctrl.joinCommunity);
router.post("/:communityId/leave", auth, ctrl.leaveCommunity);
router.get("/:communityId/feed", auth, ctrl.getCommunityFeed);
router.post("/:communityId/feed", auth, ctrl.createCommunityPost);

module.exports = router;
