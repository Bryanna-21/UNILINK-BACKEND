"use strict";

// "Sign out of all devices": every login token carries the account's tokenVersion, and the server refuses a token whose
// version is old. Raising the number ends every session at once, including this one (the person signs in again).
// User is injected (tests/sessionService.test.js).

async function logoutEverywhere({ User }, userId) {
  if (typeof userId !== "string" && typeof userId?.toString !== "function") return { ok: false };
  const result = await User.updateOne({ _id: String(userId) }, { $inc: { tokenVersion: 1 } });
  const matched = result && (result.matchedCount ?? result.n ?? (result.modifiedCount ? 1 : 0));
  return { ok: matched > 0 };
}

module.exports = { logoutEverywhere };
