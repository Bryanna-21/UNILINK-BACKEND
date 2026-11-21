const router = require("express").Router();
const { contentLimits } = require("../middleware/rateLimit.middleware");
const ctrl = require("../controllers/community.controller");
const auth = require("../middleware/auth.middleware");

// Comments
router.get("/posts/:postId/comments", auth, ctrl.getCommentsForPost);
router.post("/posts/:postId/comments", auth, contentLimits.comment, ctrl.addComment);

// Discussion
router.get("/courses/:courseId/discussion", auth, ctrl.getDiscussionForCourse);
router.post("/courses/:courseId/discussion", auth, contentLimits.comment, ctrl.postDiscussion);

// Clubs
router.get("/clubs", auth, ctrl.getClubs);
router.post("/clubs", auth, contentLimits.community, ctrl.createClub);
router.post("/clubs/:id/join", auth, ctrl.joinClub);
router.post("/clubs/:id/leave", auth, ctrl.leaveClub);

// Projects
router.get("/projects", auth, ctrl.getProjects);
router.post("/projects", auth, contentLimits.community, ctrl.createProject);

// Study Groups
router.get("/study-groups", auth, ctrl.getStudyGroups);
router.post("/study-groups", auth, contentLimits.community, ctrl.createStudyGroup);
router.post("/study-groups/:id/join", auth, ctrl.joinStudyGroup);

// Polls
router.get("/polls", auth, ctrl.getPolls);
router.post("/polls", auth, contentLimits.community, ctrl.createPoll);
router.post("/polls/:id/vote", auth, ctrl.voteOnPoll);

// Announcements
router.get("/announcements", auth, ctrl.getAnnouncements);
router.post("/announcements", auth, contentLimits.community, ctrl.createAnnouncement);

module.exports = router;
