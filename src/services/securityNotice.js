"use strict";

// A short email to the account's owner when something sensitive happens, so a stolen account cannot be changed
// silently. Best effort: a failure to send is logged and never blocks or fails the action (tests/securityNotice.test.js).
// `send(toEmail, subject, body)` is injected; the real one is sendNoticeEmail in utils/otp.util.js.

async function notifyPasswordChanged({ user, send, log = console, when = new Date() }) {
  if (!user || !user.email) return false;
  const subject = "Your UniLink password was changed";
  const body =
    `Hello${user.name ? ` ${String(user.name).split(" ")[0]}` : ""},\n\n` +
    `The password on your UniLink account was changed on ${when.toUTCString()}.\n\n` +
    `If this was you, there is nothing to do. If it was NOT you, reset your password now from the sign-in screen ` +
    `("Forgot password"), then choose "Sign out of all devices" in Settings, and tell your university administration.`;
  try {
    await send(user.email, subject, body);
    return true;
  } catch (err) {
    log.error(`[security] could not send the password-changed notice: ${err && err.message}`);
    return false;
  }
}

module.exports = { notifyPasswordChanged };
