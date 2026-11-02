"use strict";

// Who is alerted when someone files an emergency report, and what the alert says. Pure.

const sameId = (a, b) => a != null && b != null && String(a) === String(b);

// The superadmin always. An admin with no university ("platform admin") always. An admin tied to a
// university only when the student belongs to that university. Everyone else never.
// A report with no university therefore reaches only the superadmin and platform admins.
function selectAlertAdmins(users, universityId) {
  if (!Array.isArray(users)) return [];
  return users.filter((u) => {
    if (!u) return false;
    if (u.role === "superadmin") return true;
    if (u.role !== "admin") return false;
    if (!u.universityId) return true;
    return !!universityId && sameId(u.universityId, universityId);
  });
}

const clip = (s, n) => (typeof s === "string" ? s.trim().slice(0, n) : "");

// Title, body and data for the admin alert. A sensitive (abuse) report never puts its text into a
// notification, because notifications show on lock screens.
function buildAdminAlert({ type, isSOS, studentName, location, message, reportId }) {
  const who = clip(studentName, 60) || "A student";
  const place = clip(location, 80);
  if (isSOS) {
    return {
      title: "SOS ALERT",
      body: `${who} needs help${place ? ` near ${place}` : ""}. Open to respond.`,
      data: { type: "emergency_alert", reportId: String(reportId), severity: "sos" },
      record: { type: "sos_alert", message: `${who} triggered an SOS${place ? ` near ${place}` : ""}.` },
    };
  }
  const sensitive = type === "abuse";
  const text = sensitive ? "A sensitive report was filed. Open it to review." : clip(message, 140) || "No additional details provided.";
  return {
    title: `New ${type} report`,
    body: text,
    data: { type: "emergency_report", reportId: String(reportId), severity: "report" },
    record: { type: "new_emergency_report", message: text },
  };
}

// Expo messages. The loud ones use the "emergency" Android channel (created by the app, importance
// max, with vibration) and a long time-to-live so a phone that is briefly offline still rings when
// it reconnects. Quiet ones use the normal channel.
function buildPushMessages(tokens, alert, { loud, isExpoToken }) {
  const unique = [...new Set(Array.isArray(tokens) ? tokens : [])].filter(isExpoToken);
  return unique.map((to) => ({
    to,
    title: alert.title,
    body: alert.body,
    data: alert.data,
    sound: "default",
    priority: "high",
    channelId: loud ? "emergency" : "default",
    ...(loud ? { ttl: 3600 } : {}),
  }));
}

module.exports = { selectAlertAdmins, buildAdminAlert, buildPushMessages };
