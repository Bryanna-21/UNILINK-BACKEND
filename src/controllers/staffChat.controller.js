const StaffMessage = require("../models/StaffMessage");
const User = require("../models/User");
const { cleanMessageText, clampLimit } = require("../utils/staffChat.rules");

async function shape(messages, requesterId) {
  const ids = [...new Set(messages.map((m) => m.senderId))];
  const users = await User.find({ _id: { $in: ids.filter((id) => /^[a-f0-9]{24}$/i.test(id)) } }).select("name role");
  const byId = new Map(users.map((u) => [String(u._id), u]));
  return messages.map((m) => {
    const u = byId.get(String(m.senderId));
    return {
      id: String(m._id),
      text: m.text,
      createdAt: m.createdAt,
      sender: { id: String(m.senderId), name: u?.name || "Former admin", role: u?.role || "admin" },
      mine: String(m.senderId) === String(requesterId),
    };
  });
}

// GET /api/staff-chat/messages?limit=50&after=<ISO date>
// Without `after`: the newest `limit` messages, oldest first. With `after`: only newer ones.
exports.listMessages = async (req, res) => {
  try {
    const limit = clampLimit(req.query.limit);
    let messages;
    const after = req.query.after ? new Date(req.query.after) : null;
    if (after && !isNaN(after.getTime())) {
      messages = await StaffMessage.find({ createdAt: { $gt: after } }).sort({ createdAt: 1 }).limit(limit);
    } else {
      messages = (await StaffMessage.find({}).sort({ createdAt: -1 }).limit(limit)).reverse();
    }
    res.json({ status: "success", data: await shape(messages, req.user.id) });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Could not load messages." });
  }
};

// POST /api/staff-chat/messages  { text }
exports.sendMessage = async (req, res) => {
  try {
    const text = cleanMessageText(req.body?.text);
    if (!text) {
      return res.status(400).json({ status: "error", message: "Write a message of 1 to 2000 characters." });
    }
    const created = await StaffMessage.create({ senderId: String(req.user.id), text });
    const [shaped] = await shape([created], req.user.id);
    res.status(201).json({ status: "success", data: shaped });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Could not send the message." });
  }
};

// DELETE /api/staff-chat/messages/:id  (your own message, or any message if superadmin)
exports.deleteMessage = async (req, res) => {
  try {
    if (!/^[a-f0-9]{24}$/i.test(req.params.id)) {
      return res.status(400).json({ status: "error", message: "Invalid message id." });
    }
    const message = await StaffMessage.findById(req.params.id);
    if (!message) return res.status(404).json({ status: "error", message: "Message not found." });
    const own = String(message.senderId) === String(req.user.id);
    if (!own && req.user.role !== "superadmin") {
      return res.status(403).json({ status: "error", message: "You can only delete your own messages." });
    }
    await message.deleteOne();
    res.json({ status: "success" });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Could not delete the message." });
  }
};
