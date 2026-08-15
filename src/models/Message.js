const mongoose = require("mongoose");

const messageSchema = new mongoose.Schema({
  conversationId: { type: String, required: true },
  senderId: { type: String, required: true },
  text: String,
  fileUrl: String, // for voice notes / file sharing, once uploaded via the same Cloudinary path as other file features
  readBy: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Message", messageSchema);
