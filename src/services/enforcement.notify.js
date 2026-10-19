"use strict";

// Tells the right people when a penalty or an appeal changes.
//
//   user({ userId, kind, actionType })   the person it happened to
//   moderators({ kind, ... })            the moderators who must act on it
//
// Nothing sensitive goes in the text: it appears on lock screens. No reason, no policy, no names:
// the person is only told to open the app, where Account standing shows the details.

const UserNotification = require("../models/UserNotification");
const Notification = require("../models/Notification");
const User = require("../models/User");
const { sendToTokens } = require("./push.service");

const USER_TEXT = {
  imposed: ["Your account standing changed", "A moderation decision was made about your account. Open UniLink to read it."],
  held: ["Your account has been paused", "Your account is paused while a decision is reviewed. Open UniLink for details."],
  closed: ["Your account was closed", "Your account was closed. Open UniLink to read the decision and appeal it."],
  restored: ["Your account standing changed", "The pause on your account was lifted. Open UniLink for details."],
  lifted: ["Your account standing changed", "A penalty on your account was lifted. Open UniLink for details."],
  appeal_decided: ["Your appeal was decided", "A moderator has decided your appeal. Open UniLink to read the decision."],
};

async function user({ userId, kind }) {
  const [title, message] = USER_TEXT[kind] || USER_TEXT.imposed;
  const link = "/account-standing";
  await UserNotification.create({ recipientId: userId, type: "moderation", title, message, link });
  const u = await User.findById(userId).select("pushToken").lean();
  if (u && u.pushToken) await sendToTokens([u.pushToken], { title, body: message, data: { type: "moderation", link } });
}

// Moderators who can see the case: admins of that university and superadmins; superadmins only
// for restricted cases. Never the people who already took part in the decision.
async function moderators({ kind, actionId, appealId, universityId, restricted, excludeIds = [], recipientIds = null, approved, lapsed }) {
  let people;
  if (recipientIds) {
    people = await User.find({ _id: { $in: recipientIds }, deletedAt: null }).select("_id pushToken").lean();
  } else {
    const filter = restricted
      ? { role: "superadmin" }
      : { $or: [{ role: "superadmin" }, { role: "admin", universityId: universityId || null }, { role: "admin", universityId: { $in: [null, ""] } }] };
    people = await User.find({ ...filter, deletedAt: null, status: { $nin: ["suspended", "terminated"] } }).select("_id pushToken").lean();
    const skip = new Set(excludeIds.map(String));
    people = people.filter((p) => !skip.has(String(p._id)));
  }
  if (!people.length) {
    console.error(`⚠ ${kind}: no moderator available to notify`);
    return;
  }
  let title, message, link;
  if (kind === "termination_pending") {
    title = "Account closure needs a second moderator";
    message = "A moderator proposed closing an account. A different moderator must approve or reject it.";
    link = `/admin/moderation/actions/${actionId}`;
  } else if (kind === "termination_decided") {
    title = approved ? "Account closure approved" : lapsed ? "Account closure lapsed" : "Account closure not approved";
    message = lapsed ? "Nobody approved the proposed closure in time, so it lapsed." : "Your proposed account closure was decided.";
    link = `/admin/moderation/actions/${actionId}`;
  } else {
    title = "New appeal to review";
    message = "A person appealed a moderation decision. A moderator who did not take part must decide it.";
    link = `/admin/moderation/appeals/${appealId}`;
  }
  await Notification.insertMany(people.map((p) => ({ recipientId: String(p._id), type: `moderation_${kind}`, title, message, link })));
  await sendToTokens(people.map((p) => p.pushToken).filter(Boolean), { title, body: "Open UniLink to review.", data: { type: `moderation_${kind}` } });
}

module.exports = { user, moderators };
