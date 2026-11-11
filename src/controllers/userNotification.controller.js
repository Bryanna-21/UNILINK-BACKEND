const mongoose = require("mongoose");
const UserNotification = require("../models/UserNotification");
const { normalizeCategory, typeFilter, countsByCategory } = require("../utils/notification.rules");

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// This user's own notifications only, newest first, capped at 50 - same cap as the admin
// Notification list, consistent convention.
//
// ?category=all|followers|activity|mentions|updates picks one tab (default all). New-message
// notifications are never in this list or in its counts: messages show on the Messages screen.
//
// Returns, alongside the list, the unread count (unreadCount) and the unread count of every tab
// (counts), so the screen can badge its tabs without more requests.
exports.getMyNotifications = async (req, res) => {
  try {
    const category = normalizeCategory(req.query.category);
    const mine = { recipientId: req.user.id };

    const [notifications, unreadRows] = await Promise.all([
      UserNotification.find({ ...mine, type: typeFilter(category) })
        .sort({ createdAt: -1 })
        .limit(50),
      UserNotification.aggregate([
        { $match: { ...mine, read: false, type: typeFilter("all") } },
        { $group: { _id: "$type", n: { $sum: 1 } } },
      ]),
    ]);

    const counts = countsByCategory(unreadRows);

    res.status(200).json({
      status: "success",
      category,
      count: notifications.length,
      unreadCount: counts.all,
      counts,
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

// Marks this user's unread notifications read at once - the "clear all" action. With
// ?category=... only that tab is cleared, so "Mark all read" on Followers leaves the rest alone.
exports.markAllRead = async (req, res) => {
  try {
    await UserNotification.updateMany(
      { recipientId: req.user.id, read: false, type: typeFilter(req.query.category) },
      { read: true }
    );
    res.status(200).json({ status: "success", message: "All notifications marked read" });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error updating notifications: " + error.message });
  }
};
