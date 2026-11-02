"use strict";

// The rules of a call, as pure functions so every one is tested without a database.
//
// A call goes:  ringing -> active -> ended
//                    \-> missed (nobody answered in time)
//                    \-> declined (the other person said no)
//                    \-> cancelled (the caller hung up before an answer)
// Version 1 is one-to-one calls inside a direct conversation. Group calls come later.

const RING_MS = 45 * 1000; // how long a call rings
const ACTIVE_MAX_MS = 4 * 60 * 60 * 1000; // a call "in progress" for longer than this is treated as over
const AI_WINDOW_MS = 24 * 60 * 60 * 1000; // the AI recap stays available this long after a call ends
const TYPES = ["voice", "video"];

const OPEN = ["ringing", "active"];
const sameId = (a, b) => a != null && b != null && String(a) === String(b);
const ms = (d) => (d ? new Date(d).getTime() : NaN);

// The status a call really has right now. A call that rang too long is missed even if no timer
// ran (the server may have restarted); one that was "active" for hours is over.
function effectiveStatus(call, now = Date.now()) {
  if (!call) return null;
  if (call.status === "ringing" && now - ms(call.createdAt) > RING_MS) return "missed";
  if (call.status === "active" && now - ms(call.answeredAt || call.createdAt) > ACTIVE_MAX_MS) return "ended";
  return call.status;
}

const isOpen = (call, now = Date.now()) => OPEN.includes(effectiveStatus(call, now));

const fail = (status, code, message) => ({ ok: false, status, code, message });

// Can `callerId` start a call in this conversation?
//   busy: user ids that are in a call right now (ringing or active)
function checkCanStart({ conversation, callerId, type, blocked, busy }) {
  if (!TYPES.includes(type)) return fail(400, "BAD_TYPE", "Choose a voice or video call.");
  if (!conversation) return fail(404, "NOT_FOUND", "Conversation not found.");
  const ids = (conversation.participantIds || []).map(String);
  if (!ids.includes(String(callerId))) return fail(403, "NOT_PARTICIPANT", "You are not in this conversation.");
  if (conversation.type !== "direct" || ids.length !== 2) {
    return fail(400, "DIRECT_ONLY", "Calls work in one-to-one chats for now.");
  }
  const calleeId = ids.find((id) => id !== String(callerId));
  if (!calleeId) return fail(400, "DIRECT_ONLY", "Calls work in one-to-one chats for now.");
  if (blocked) return fail(403, "BLOCKED", "You can't call this person.");
  const busyIds = (busy || []).map(String);
  if (busyIds.includes(String(callerId))) return fail(409, "CALLER_BUSY", "You are already in a call.");
  if (busyIds.includes(calleeId)) return fail(409, "CALLEE_BUSY", "They are on another call. Try again soon.");
  return { ok: true, calleeId };
}

// May `userId` do `action` to this call right now?
//   accept, decline : only the person being called, only while it rings
//   cancel          : only the caller, only while it rings
//   end             : either person, while it is active (the caller may also end a ringing call)
//   read            : either person
function checkCanAct(call, userId, action, now = Date.now()) {
  if (!call) return fail(404, "NOT_FOUND", "Call not found.");
  const ids = (call.participantIds || []).map(String);
  if (!ids.includes(String(userId))) return fail(404, "NOT_FOUND", "Call not found."); // do not reveal it exists
  const status = effectiveStatus(call, now);
  const isCaller = sameId(call.callerId, userId);

  if (action === "read") return { ok: true, status };
  if (action === "accept" || action === "decline") {
    if (isCaller) return fail(403, "NOT_CALLEE", "You started this call.");
    if (status !== "ringing") return fail(409, "NOT_RINGING", status === "missed" ? "This call was missed." : "This call is over.");
    return { ok: true, status };
  }
  if (action === "cancel") {
    if (!isCaller) return fail(403, "NOT_CALLER", "Only the person who called can cancel.");
    if (status !== "ringing") return fail(409, "NOT_RINGING", "This call is no longer ringing.");
    return { ok: true, status };
  }
  if (action === "end") return { ok: true, status }; // idempotent: the service decides what to do from status
  return fail(400, "BAD_ACTION", "Unknown action.");
}

function durationSec(call) {
  const start = ms(call?.answeredAt);
  const end = ms(call?.endedAt);
  if (!Number.isFinite(start) || !Number.isFinite(end) || end < start) return 0;
  return Math.round((end - start) / 1000);
}

function formatDuration(totalSec) {
  const s = Math.max(0, Math.floor(totalSec || 0));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  const sec = s % 60;
  const two = (n) => String(n).padStart(2, "0");
  return h > 0 ? `${h}:${two(m)}:${two(sec)}` : `${m}:${two(sec)}`;
}

// The line the chat shows for a call that has finished.
function callLogText(call) {
  const kind = call.type === "video" ? "video" : "voice";
  const icon = call.type === "video" ? "\uD83C\uDFA5" : "\uD83D\uDCDE";
  switch (call.status) {
    case "ended":
      return `${icon} ${kind[0].toUpperCase()}${kind.slice(1)} call \u00B7 ${formatDuration(durationSec(call))}`;
    case "declined":
      return `${icon} Declined ${kind} call`;
    case "missed":
    case "cancelled":
      return `${icon} Missed ${kind} call`;
    default:
      return `${icon} ${kind[0].toUpperCase()}${kind.slice(1)} call`;
  }
}

// What the app receives. Never includes the room name or any token.
function shapeCall(call, viewerId, names = {}) {
  const incoming = !sameId(call.callerId, viewerId);
  const otherId = (call.participantIds || []).map(String).find((id) => id !== String(viewerId)) || null;
  return {
    id: String(call._id),
    conversationId: String(call.conversationId),
    type: call.type,
    status: call.status,
    direction: incoming ? "incoming" : "outgoing",
    callerId: String(call.callerId),
    callerName: names[String(call.callerId)] || "",
    otherId,
    otherName: otherId ? names[otherId] || "" : "",
    createdAt: call.createdAt,
    answeredAt: call.answeredAt || null,
    endedAt: call.endedAt || null,
    durationSec: call.status === "ended" ? durationSec(call) : 0,
  };
}

module.exports = {
  RING_MS, ACTIVE_MAX_MS, AI_WINDOW_MS, TYPES, OPEN,
  effectiveStatus, isOpen, checkCanStart, checkCanAct, durationSec, formatDuration, callLogText, shapeCall,
};
