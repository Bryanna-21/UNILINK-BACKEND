const router = require("express").Router();
const ctrl = require("../controllers/community.controller");
const auth = require("../middleware/auth.middleware");

// Comments
router.get("/posts/:postId/comments", auth, ctrl.getCommentsForPost);
router.post("/posts/:postId/comments", auth, ctrl.addComment);

// Discussion
router.get("/courses/:courseId/discussion", auth, ctrl.getDiscussionForCourse);
router.post("/courses/:courseId/discussion", auth, ctrl.postDiscussion);

// Clubs
router.get("/clubs", auth, ctrl.getClubs);
router.post("/clubs", auth, ctrl.createClub);
router.post("/clubs/:id/join", auth, ctrl.joinClub);
router.post("/clubs/:id/leave", auth, ctrl.leaveClub);

// Projects
router.get("/projects", auth, ctrl.getProjects);
router.post("/projects", auth, ctrl.createProject);

// Study Groups
router.get("/study-groups", auth, ctrl.getStudyGroups);
router.post("/study-groups", auth, ctrl.createStudyGroup);
router.post("/study-groups/:id/join", auth, ctrl.joinStudyGroup);

// Polls
router.get("/polls", auth, ctrl.getPolls);
router.post("/polls", auth, ctrl.createPoll);
router.post("/polls/:id/vote", auth, ctrl.voteOnPoll);

// Announcements
router.get("/announcements", auth, ctrl.getAnnouncements);
router.post("/announcements", auth, ctrl.createAnnouncement);

module.exports = router;
