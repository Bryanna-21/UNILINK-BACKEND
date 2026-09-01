const router = require("express").Router();
const ctrl = require("../controllers/message.controller");
const auth = require("../middleware/auth.middleware");

router.get("/", auth, ctrl.getMyConversations);
router.post("/start", auth, ctrl.startConversation);

router.get("/course/:courseId", auth, ctrl.getCourseConversation);
router.post("/:conversationId/join", auth, ctrl.joinConversation);
router.post("/:conversationId/members", auth, ctrl.addMember);
router.post("/:conversationId/leave", auth, ctrl.leaveConversation);

router.get("/:conversationId/messages", auth, ctrl.getMessages);
router.post("/:conversationId/messages", auth, ctrl.sendMessage);

module.exports = router;
