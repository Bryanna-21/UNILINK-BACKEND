const mongoose = require("mongoose");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");
const Course = require("../models/Course");
const notifyUsers = require("../middleware/notifyUsers.middleware");

// NOTE: this is REST-only persistence. There is no Socket.io here —
// messages are saved and fetched via HTTP, meaning clients have to
// poll (re-fetch) to see new messages rather than receive them
// instantly. Real-time delivery and typing indicators still need a
// Socket.io layer added on top of this. Read tracking (below) is now
// built, reusing Message.readBy rather than a separate model — see
// getMessages for where messages actually get marked read.

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// Unread count per conversation: messages NOT sent by this user where
// this user's id isn't yet in readBy. Own messages are pre-seeded
// into their own readBy at send time (see sendMessage) and are never
// counted as unread to their own sender regardless.
//
// Single aggregation across every conversation the user is a
// participant in, rather than one query per conversation — avoids an
// N+1 query pattern as the conversation list grows.
const getUnreadCounts = async (conversationIds, userId) => {
  const counts = await Message.aggregate([
    {
      $match: {
        conversationId: { $in: conversationIds.map(String) },
        senderId: { $ne: userId },
        readBy: { $ne: userId },
      },
    },
    {
      $group: {
        _id: "$conversationId",
        count: { $sum: 1 },
      },
    },
  ]);

  const countByConversationId = {};
  counts.forEach((c) => {
    countByConversationId[c._id] = c.count;
  });
  return countByConversationId;
};

exports.getMyConversations = async (req, res) => {
  try {
    const conversations = await Conversation.find({ participantIds: req.user.id }).sort({ lastMessageAt: -1 });

    const countByConversationId = await getUnreadCounts(
      conversations.map((c) => c._id),
      req.user.id
    );

    const withUnread = conversations.map((c) => ({
      ...c.toObject(),
      unreadCount: countByConversationId[c._id.toString()] || 0,
    }));

    res.status(200).json({ status: "success", count: withUnread.length, data: withUnread });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching conversations: " + error.message });
  }
};

// Branches on request shape:
//  - otherUserId -> find-or-create a direct conversation (unchanged).
//  - courseId -> find-or-create a course conversation shell. Does NOT
//    add the requester as a participant (opt-in via joinConversation).
//    Restricted to enrolled students + the course's lecturer.
//  - title (with neither otherUserId nor courseId) -> create a
//    standalone discussion group. Requester IS added as the creator
//    and first participant immediately — unlike course chat, a group
//    with zero members including its own creator makes no sense,
//    since nobody else can invite anyone into an empty group.
exports.startConversation = async (req, res) => {
  try {
    const { otherUserId, courseId, title } = req.body;

    if (otherUserId) {
      const existing = await Conversation.findOne({
        type: "direct",
        participantIds: { $all: [req.user.id, otherUserId], $size: 2 },
      });
      if (existing) {
        return res.status(200).json({ status: "success", data: existing });
      }

      const conversation = await Conversation.create({
        type: "direct",
        participantIds: [req.user.id, otherUserId],
      });
      return res.status(201).json({ status: "success", data: conversation });
    }

    if (courseId) {
      const course = await Course.findById(courseId);
      if (!course) {
        return res.status(404).json({ status: "error", message: "Course not found" });
      }

      const isEnrolled = course.enrolledStudentIds.includes(req.user.id);
      const isLecturer = course.lecturerId === req.user.id;
      if (!isEnrolled && !isLecturer) {
        return res.status(403).json({ status: "error", message: "You are not enrolled in this course" });
      }

      const existing = await Conversation.findOne({ type: "course", courseId });
      if (existing) {
        return res.status(200).json({ status: "success", data: existing });
      }

      const conversation = await Conversation.create({
        type: "course",
        courseId,
        title: title || course.title,
        participantIds: [],
      });
      return res.status(201).json({ status: "success", data: conversation });
    }

    if (title && title.trim()) {
      const conversation = await Conversation.create({
        type: "group",
        title: title.trim(),
        createdBy: req.user.id,
        participantIds: [req.user.id],
      });
      return res.status(201).json({ status: "success", data: conversation });
    }

    return res.status(400).json({ status: "error", message: "otherUserId, courseId, or title is required" });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error starting conversation: " + error.message });
  }
};

// Lets a course page check whether a course chat exists and show its
// metadata WITHOUT requiring the requester already be a participant —
// necessary under opt-in membership, since a student who hasn't
// joined yet still needs to discover the chat exists before joining.
exports.getCourseConversation = async (req, res) => {
  try {
    const { courseId } = req.params;
    const conversation = await Conversation.findOne({ type: "course", courseId });

    if (!conversation) {
      return res.status(200).json({ status: "success", data: null });
    }

    res.status(200).json({
      status: "success",
      data: {
        _id: conversation._id,
        title: conversation.title,
        courseId: conversation.courseId,
        participantCount: conversation.participantIds.length,
        isParticipant: conversation.participantIds.includes(req.user.id),
      },
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching course conversation: " + error.message });
  }
};

// Self-join, type "course" ONLY. Standalone groups are invite-only
// (see addMember below) — there is no self-join path for them.
// Enrollment is re-checked here, not just at creation time, since a
// student could discover a conversation id without having been
// enrolled when the conversation was first created.
exports.joinConversation = async (req, res) => {
  try {
    if (!isValidId(req.params.conversationId)) {
      return res.status(400).json({ status: "error", message: "Invalid conversation id" });
    }

    const conversation = await Conversation.findById(req.params.conversationId);
    if (!conversation) {
      return res.status(404).json({ status: "error", message: "Conversation not found" });
    }
    if (conversation.type !== "course") {
      return res.status(400).json({ status: "error", message: "Only course conversations can be self-joined. Groups are invite-only." });
    }

    const course = await Course.findById(conversation.courseId);
    const isEnrolled = course?.enrolledStudentIds.includes(req.user.id);
    const isLecturer = course?.lecturerId === req.user.id;
    if (!isEnrolled && !isLecturer) {
      return res.status(403).json({ status: "error", message: "You are not enrolled in this course" });
    }

    if (!conversation.participantIds.includes(req.user.id)) {
      conversation.participantIds.push(req.user.id);
      await conversation.save();
    }

    res.status(200).json({ status: "success", data: conversation });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error joining conversation: " + error.message });
  }
};

// Adds a DIFFERENT user to a standalone group. type "group" ONLY.
// Requester must already be a participant (any existing member can
// invite, not just the creator — a deliberate choice to keep this
// simple; restricting invites to the creator only is a possible
// future tightening if groups turn out to need moderation).
exports.addMember = async (req, res) => {
  try {
    if (!isValidId(req.params.conversationId)) {
      return res.status(400).json({ status: "error", message: "Invalid conversation id" });
    }

    const { targetUserId } = req.body;
    if (!targetUserId) {
      return res.status(400).json({ status: "error", message: "targetUserId is required" });
    }

    const conversation = await Conversation.findById(req.params.conversationId);
    if (!conversation) {
      return res.status(404).json({ status: "error", message: "Conversation not found" });
    }
    if (conversation.type !== "group") {
      return res.status(400).json({ status: "error", message: "Only standalone groups support inviting members this way" });
    }
    if (!conversation.participantIds.includes(req.user.id)) {
      return res.status(403).json({ status: "error", message: "Only existing members can add people to this group" });
    }

    if (!conversation.participantIds.includes(targetUserId)) {
      conversation.participantIds.push(targetUserId);
      await conversation.save();
    }

    res.status(200).json({ status: "success", data: conversation });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error adding member: " + error.message });
  }
};

// Voluntary leave. Valid for "course" (opt-out of a course chat you'd
// previously joined) and "group" (leave a discussion group). NOT
// valid for "direct" — there's no product requirement for it yet,
// and it would need different UX (delete the whole thread? just hide
// it from the list?) than a simple participant removal.
exports.leaveConversation = async (req, res) => {
  try {
    if (!isValidId(req.params.conversationId)) {
      return res.status(400).json({ status: "error", message: "Invalid conversation id" });
    }

    const conversation = await Conversation.findById(req.params.conversationId);
    if (!conversation) {
      return res.status(404).json({ status: "error", message: "Conversation not found" });
    }
    if (!["course", "group"].includes(conversation.type)) {
      return res.status(400).json({ status: "error", message: "This conversation type cannot be left" });
    }

    conversation.participantIds = conversation.participantIds.filter(
      (id) => id !== req.user.id
    );
    await conversation.save();

    res.status(200).json({ status: "success", data: conversation });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error leaving conversation: " + error.message });
  }
};

// Fetching messages now also marks every unread message in this
// conversation as read by the current user — there is no separate
// "mark as read" action or endpoint. Opening a conversation IS the
// read action, matching how most chat apps behave. $addToSet avoids
// duplicate entries if this fires more than once for the same user
// (e.g. re-fetching during polling).
exports.getMessages = async (req, res) => {
  try {
    if (!isValidId(req.params.conversationId)) {
      return res.status(400).json({ status: "error", message: "Invalid conversation id" });
    }
    const conversation = await Conversation.findById(req.params.conversationId);
    if (!conversation || !conversation.participantIds.includes(req.user.id)) {
      return res.status(403).json({ status: "error", message: "Not a participant in this conversation" });
    }

    await Message.updateMany(
      {
        conversationId: req.params.conversationId,
        senderId: { $ne: req.user.id },
        readBy: { $ne: req.user.id },
      },
      { $addToSet: { readBy: req.user.id } }
    );

    const messages = await Message.find({ conversationId: req.params.conversationId }).sort({ createdAt: 1 });
    res.status(200).json({ status: "success", count: messages.length, data: messages });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching messages: " + error.message });
  }
};

exports.sendMessage = async (req, res) => {
  try {
    if (!isValidId(req.params.conversationId)) {
      return res.status(400).json({ status: "error", message: "Invalid conversation id" });
    }
    const conversation = await Conversation.findById(req.params.conversationId);
    if (!conversation || !conversation.participantIds.includes(req.user.id)) {
      return res.status(403).json({ status: "error", message: "Not a participant in this conversation" });
    }
    const { text } = req.body;
    if (!text || !text.trim()) {
      return res.status(400).json({ status: "error", message: "text is required" });
    }
    const message = await Message.create({
      conversationId: req.params.conversationId,
      senderId: req.user.id,
      text,
      readBy: [req.user.id],
    });
    conversation.lastMessageAt = new Date();
    await conversation.save();
    if (conversation.type === "direct") {
      const recipientId = conversation.participantIds.find((id) => id !== req.user.id);
      notifyUsers({
        recipientIds: recipientId,
        type: "new_message",
        title: "New message",
        message: text.trim().length > 80 ? text.trim().slice(0, 80) + "..." : text.trim(),
        link: `/messages/${req.params.conversationId}`,
        context: { conversationId: req.params.conversationId },
      });
    }
    res.status(201).json({ status: "success", data: message });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error sending message: " + error.message });
  }
};
