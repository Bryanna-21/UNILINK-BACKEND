const mongoose = require("mongoose");
const Conversation = require("../models/Conversation");
const Message = require("../models/Message");

// NOTE: this is REST-only persistence. There is no Socket.io here —
// messages are saved and fetched via HTTP, meaning the mobile app
// has to poll (re-fetch) to see new messages rather than receive
// them instantly. Real-time delivery, typing indicators, and read
// receipts all need a Socket.io layer added on top of this, which
// is a separate piece of work, not bundled in here.

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

exports.getMyConversations = async (req, res) => {
  try {
    const conversations = await Conversation.find({ participantIds: req.user.id }).sort({ lastMessageAt: -1 });
    res.status(200).json({ status: "success", count: conversations.length, data: conversations });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching conversations: " + error.message });
  }
};

exports.startConversation = async (req, res) => {
  try {
    const { otherUserId } = req.body;
    if (!otherUserId) {
      return res.status(400).json({ status: "error", message: "otherUserId is required" });
    }

    // Reuse an existing 1:1 conversation instead of creating a
    // duplicate every time two users message each other.
    const existing = await Conversation.findOne({
      participantIds: { $all: [req.user.id, otherUserId], $size: 2 }
    });
    if (existing) {
      return res.status(200).json({ status: "success", data: existing });
    }

    const conversation = await Conversation.create({
      participantIds: [req.user.id, otherUserId]
    });
    res.status(201).json({ status: "success", data: conversation });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error starting conversation: " + error.message });
  }
};

exports.getMessages = async (req, res) => {
  try {
    if (!isValidId(req.params.conversationId)) {
      return res.status(400).json({ status: "error", message: "Invalid conversation id" });
    }
    const conversation = await Conversation.findById(req.params.conversationId);
    if (!conversation || !conversation.participantIds.includes(req.user.id)) {
      return res.status(403).json({ status: "error", message: "Not a participant in this conversation" });
    }
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
      readBy: [req.user.id]
    });
    conversation.lastMessageAt = new Date();
    await conversation.save();
    res.status(201).json({ status: "success", data: message });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error sending message: " + error.message });
  }
};
