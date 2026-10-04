"use strict";

const Notification = require("../models/Notification");
const User = require("../models/User");
const { sendPushNotification } = require("../utils/push.util");

// Tells the RIGHT moderators that a report needs review.
//
// Why this is not the existing notifyAdmins: that helper pings every admin at every
// university and has no notion of scope. A safety report must reach only
//   - the admins of the university it came from, and
//   - superadmins, for severe reports (P0/P1) and always for restricted ones;
// and a restricted report (child safety, or about an administrator) goes to superadmins ONLY.
//
// Nothing sensitive goes in the text: it appears on lock screens. No category, no content,
// no names: just a reference number and a severity. Details are behind the dashboard login.

async function reportFiled(report) {
  const severe = report.severity === "P0" || report.severity === "P1";

  const recipientFilter = report.restrictedToSuperadmin
    ? { role: "superadmin" }
    : {
        $or: [
          { role: "admin", universityId: report.universityId },
          ...(severe ? [{ role: "superadmin" }] : []),
        ],
      };

  const recipients = await User.find({
    ...recipientFilter,
    deletedAt: null,
    status: { $nin: ["suspended", "terminated"] },
  }).select("_id pushToken").lean();
  if (!recipients.length) {
    console.error(`⚠ Report ${report.reference} (${report.severity}) has NO moderator to notify.`);
    return;
  }

  const critical = report.severity === "P0";
  const title = critical ? "Critical report needs review" : "New report to review";
  const message = `Reference ${report.reference}`;
  const link = `/admin/moderation/reports/${report._id}`;

  await Notification.insertMany(
    recipients.map((r) => ({ recipientId: String(r._id), type: "moderation_report", title, message, link }))
  );

  for (const r of recipients) {
    if (!r.pushToken) continue;
    sendPushNotification(r.pushToken, {
      title,
      body: "Open UniLink to review.",
      data: { type: "moderation_report", reportId: String(report._id) },
    }).catch(() => {});
  }
}

module.exports = { reportFiled };
