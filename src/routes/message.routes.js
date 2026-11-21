const router = require("express").Router();
const { contentLimits } = require("../middleware/rateLimit.middleware");
const ctrl = require("../controllers/message.controller");
const auth = require("../middleware/auth.middleware");
const { requireFeature } = require("../middleware/featureGuard");

router.get("/", auth, ctrl.getMyConversations);
router.post("/start", auth, contentLimits.community, requireFeature("messaging"), ctrl.startConversation);

router.get("/course/:courseId", auth, ctrl.getCourseConversation);
router.post("/:conversationId/join", auth, ctrl.joinConversation);
router.post("/:conversationId/members", auth, ctrl.addMember);
router.post("/:conversationId/leave", auth, ctrl.leaveConversation);

router.post("/:conversationId/pin", auth, ctrl.togglePin);
router.get("/:conversationId/info", auth, ctrl.getConversationInfo);
router.get("/:conversationId/messages", auth, ctrl.getMessages);
router.post("/:conversationId/messages", auth, contentLimits.message, requireFeature("messaging"), ctrl.sendMessage);
router.patch("/:conversationId/messages/:messageId", auth, requireFeature("messaging"), ctrl.editMessage);
router.post("/:conversationId/messages/:messageId/reactions", auth, ctrl.toggleReaction);

module.exports = router;
