"use strict";

// Alerts the right admins when an emergency report is filed. Dependencies are injected so the
// exact code that runs in production is tested without a database or the network
// (tests/emergencyAlert.service.test.js); emergencyAlert.instance.js wires in the real ones.
//
// Three stages, each isolated: a failure in one never stops the others, and nothing here can
// throw. A failed alert must never be the reason an emergency report fails to save.
//   1. in-app notification rows (what the admin panel and notification lists read)
//   2. a live event to every connected admin of the right scope (web banner)
//   3. a push notification to their phones; SOS uses the loud "emergency" channel

const { selectAlertAdmins, buildAdminAlert, buildPushMessages } = require("../utils/emergencyAlert.rules");

function createEmergencyAlerts({ User, Notification, sendPushBatch, isExpoToken, emitToUsers, log = console }) {
  async function alertAdmins({ report, isSOS }) {
    const summary = { recipients: 0, recorded: 0, live: false, pushed: { sent: 0, failed: 0 } };
    try {
      const [candidates, student] = await Promise.all([
        User.find({ role: { $in: ["admin", "superadmin"] }, status: "active", deletedAt: null, removedAt: null })
          .select("_id role universityId pushToken")
          .lean(),
        User.findById(report.userId).select("name").lean(),
      ]);

      const recipients = selectAlertAdmins(candidates, report.universityId);
      summary.recipients = recipients.length;
      if (!recipients.length) {
        log.warn(`[emergency] report ${report._id} has no admin to alert (university ${report.universityId || "none"})`);
        return summary;
      }

      const alert = buildAdminAlert({
        type: report.type,
        isSOS,
        studentName: student?.name,
        location: report.location,
        message: report.message,
        reportId: report._id,
      });
      const ids = recipients.map((r) => String(r._id));

      try {
        await Notification.insertMany(
          ids.map((recipientId) => ({
            recipientId,
            type: alert.record.type,
            title: alert.title,
            message: alert.record.message,
            link: "/reports",
          }))
        );
        summary.recorded = ids.length;
      } catch (error) {
        log.error("[emergency] could not record admin notifications:", error.message);
      }

      try {
        emitToUsers(ids, isSOS ? "emergency-alert" : "emergency-report", {
          reportId: String(report._id),
          type: report.type,
          title: alert.title,
          body: alert.body,
          createdAt: new Date().toISOString(),
        });
        summary.live = true;
      } catch (error) {
        log.error("[emergency] live alert failed:", error.message);
      }

      try {
        const messages = buildPushMessages(
          recipients.map((r) => r.pushToken),
          alert,
          { loud: !!isSOS, isExpoToken }
        );
        if (messages.length) {
          const result = await sendPushBatch(messages);
          summary.pushed = { sent: result.sent || 0, failed: result.failed || 0 };
          if (Array.isArray(result.invalidTokens) && result.invalidTokens.length) {
            await User.updateMany({ pushToken: { $in: result.invalidTokens } }, { $set: { pushToken: null } });
          }
        }
      } catch (error) {
        log.error("[emergency] push failed:", error.message);
      }
    } catch (error) {
      log.error("[emergency] alertAdmins failed:", error.message);
    }
    return summary;
  }

  return { alertAdmins };
}

module.exports = { createEmergencyAlerts };
