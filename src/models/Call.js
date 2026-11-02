const mongoose = require("mongoose");

// One document per call attempt. Plain-string ids, like Conversation and Message.
const callSchema = new mongoose.Schema({
  conversationId: { type: String, required: true, index: true },
  callerId: { type: String, required: true },
  participantIds: { type: [String], required: true, index: true },
  type: { type: String, enum: ["voice", "video"], required: true },
  status: { type: String, enum: ["ringing", "active", "ended", "missed", "declined", "cancelled"], default: "ringing", index: true },
  room: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  answeredAt: { type: Date, default: null },
  endedAt: { type: Date, default: null },
  endReason: { type: String, default: null },
});

module.exports = mongoose.model("Call", callSchema);
