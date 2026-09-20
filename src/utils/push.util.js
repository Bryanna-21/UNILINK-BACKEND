// Sends push notifications via Expo's push API directly over HTTPS —
// deliberately not using the expo-server-sdk package, since a single
// POST to a fixed, stable, documented endpoint doesn't justify a new
// dependency. https://docs.expo.dev/push-notifications/sending-notifications/

const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";

// Never throws — a broken push pipeline must never break whatever
// action triggered it, same rationale as notifyAdmins.middleware.js
// and sms.util.js. pushToken may legitimately be null (user hasn't
// opened the app since push was added, or denied permission) — that
// is silently skipped, not an error.
async function sendPushNotification(pushToken, { title, body, data }) {
  if (!pushToken) return { status: "skipped", reason: "no push token" };
  try {
    const res = await fetch(EXPO_PUSH_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json", Accept: "application/json" },
      body: JSON.stringify({ to: pushToken, title, body, data, sound: "default", priority: "high" }),
    });
    const json = await res.json();
    if (json?.data?.status === "error") {
      console.error("✗ Expo push error:", json.data.message);
      return { status: "failed", error: json.data.message };
    }
    return { status: "sent" };
  } catch (error) {
    console.error("✗ Failed to send push notification:", error.message);
    return { status: "failed", error: error.message };
  }
}

module.exports = { sendPushNotification };
