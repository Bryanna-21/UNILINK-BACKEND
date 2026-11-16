"use strict";

// Adds who did it (name and profile photo) to each notification, for the notification screens. One query for all
// of them. A person who no longer exists simply has no name or photo. User is injected (tests/notificationActors.test.js).

async function attachActors(User, notifications) {
  const ids = [...new Set(notifications.map((n) => n.actorId).filter((x) => /^[a-f\d]{24}$/i.test(String(x || ""))).map(String))];
  if (ids.length === 0) return notifications.map((n) => ({ ...n, actorName: null, actorAvatarUrl: null }));
  const users = await User.find({ _id: { $in: ids } }).select("_id name avatarUrl").lean();
  const byId = new Map(users.map((u) => [String(u._id), u]));
  return notifications.map((n) => {
    const u = n.actorId ? byId.get(String(n.actorId)) : null;
    return { ...n, actorName: u ? u.name || null : null, actorAvatarUrl: u ? u.avatarUrl || null : null };
  });
}

module.exports = { attachActors };
