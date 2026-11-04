"use strict";

// Sends one notification to many devices and forgets tokens that no longer work. Fire and forget:
// it never throws, so a push problem can never fail the action that triggered it.
const { buildMessages, sendPushBatch } = require("../utils/pushBatch");

async function sendToTokens(tokens, { title, body, data }) {
  try {
    const messages = buildMessages(tokens, { title, body, data });
    if (!messages.length) return { sent: 0, failed: 0, invalidTokens: [] };
    const result = await sendPushBatch(messages);
    if (result.invalidTokens.length) {
      const User = require("../models/User"); // required here to avoid a circular import
      await User.updateMany({ pushToken: { $in: result.invalidTokens } }, { $set: { pushToken: null } });
    }
    if (result.failed) console.error(`[push] ${result.failed} of ${messages.length} notifications failed`);
    return result;
  } catch (error) {
    console.error("[push] send failed:", error.message);
    return { sent: 0, failed: 0, invalidTokens: [] };
  }
}

module.exports = { sendToTokens };
