const mongoose = require("mongoose");

const conversationSchema = new mongoose.Schema({
  participantIds: { type: [String], required: true },
  lastMessageAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Conversation", conversationSchema);
