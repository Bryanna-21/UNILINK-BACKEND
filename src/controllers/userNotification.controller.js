const mongoose = require("mongoose");
const UserNotification = require("../models/UserNotification");

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// This user's own notifications only, newest first, capped at 50 -
// same cap as the admin Notification list, consistent convention.
// Returns unreadCount alongside the list so the frontend doesn't need
// a second request just to show a badge count.
exports.getMyNotifications = async (req, res) => {
  try {
    const [notifications, unreadCount] = await Promise.all([
      UserNotification.find({ recipientId: req.user.id })
        .sort({ createdAt: -1 })
        .limit(50),
      UserNotification.countDocuments({ recipientId: req.user.id, read: false }),
    ]);

    res.status(200).json({
      status: "success",
      count: notifications.length,
      unreadCount,
      data: notifications,
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching notifications: " + error.message });
  }
};

// Marks a single notification read. Scoped to recipientId in the
// query itself (not just checked after fetching) so a user can never
// mark - or even discover the existence of - another user's
// notification by guessing an id.
exports.markNotificationRead = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ status: "error", message: "Invalid notification id" });
    }

    const notification = await UserNotification.findOneAndUpdate(
      { _id: req.params.id, recipientId: req.user.id },
      { read: true },
      { new: true }
    );

    if (!notification) {
      return res.status(404).json({ status: "error", message: "Notification not found" });
    }

    res.status(200).json({ status: "success", data: notification });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error updating notification: " + error.message });
  }
};

// Marks every one of this user's unread notifications read at once -
// the "clear all" action a notification list typically needs.
exports.markAllRead = async (req, res) => {
  try {
    await UserNotification.updateMany(
      { recipientId: req.user.id, read: false },
      { read: true }
    );
    res.status(200).json({ status: "success", message: "All notifications marked read" });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error updating notifications: " + error.message });
  }
};
