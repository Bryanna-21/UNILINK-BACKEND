const express = require("express");
const router = express.Router();
const auth = require("../middleware/auth.middleware");
const { requireFeature } = require("../middleware/featureGuard");
const ctrl = require("../controllers/community_v2.controller");

router.get("/", auth, ctrl.getCommunities);
router.post("/", auth, requireFeature("communities"), ctrl.createCommunity);
router.post("/:communityId/join", auth, requireFeature("communities"), ctrl.joinCommunity);
router.post("/:communityId/leave", auth, ctrl.leaveCommunity);
router.get("/:communityId/feed", auth, ctrl.getCommunityFeed);
router.post("/:communityId/feed", auth, requireFeature("posting"), ctrl.createCommunityPost);

module.exports = router;
