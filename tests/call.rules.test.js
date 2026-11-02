"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const r = require("../src/utils/call.rules");

const A = "a".repeat(24), B = "b".repeat(24), C = "c".repeat(24);
const T0 = Date.parse("2026-11-01T10:00:00Z");
const direct = { type: "direct", participantIds: [A, B] };
const call = (over = {}) => ({ _id: "1", callerId: A, participantIds: [A, B], type: "voice", status: "ringing", createdAt: new Date(T0), answeredAt: null, endedAt: null, ...over });

test("a ringing call becomes missed after 45 seconds, and not before", () => {
  assert.equal(r.effectiveStatus(call(), T0 + 44000), "ringing");
  assert.equal(r.effectiveStatus(call(), T0 + 45000), "ringing");
  assert.equal(r.effectiveStatus(call(), T0 + 45001), "missed");
});

test("an active call is over after 4 hours, measured from when it was answered", () => {
  const c = call({ status: "active", answeredAt: new Date(T0 + 1000) });
  assert.equal(r.effectiveStatus(c, T0 + 4 * 3600 * 1000), "active");
  assert.equal(r.effectiveStatus(c, T0 + 1000 + 4 * 3600 * 1000 + 1), "ended");
});

test("finished states are left alone", () => {
  for (const s of ["ended", "missed", "declined", "cancelled"]) assert.equal(r.effectiveStatus(call({ status: s }), T0 + 9e9), s);
  assert.equal(r.effectiveStatus(null), null);
});

test("isOpen is true only for ringing and active", () => {
  assert.equal(r.isOpen(call(), T0 + 1000), true);
  assert.equal(r.isOpen(call({ status: "active", answeredAt: new Date(T0) }), T0 + 1000), true);
  assert.equal(r.isOpen(call({ status: "ended" }), T0), false);
  assert.equal(r.isOpen(call(), T0 + 99999), false);
});

test("a one-to-one voice or video call can start", () => {
  for (const type of ["voice", "video"]) {
    const x = r.checkCanStart({ conversation: direct, callerId: A, type, blocked: false, busy: [] });
    assert.equal(x.ok, true);
    assert.equal(x.calleeId, B);
  }
});

test("only voice and video are call types", () => {
  for (const type of ["audio", "", undefined, null, "VIDEO", 5]) assert.equal(r.checkCanStart({ conversation: direct, callerId: A, type, blocked: false, busy: [] }).code, "BAD_TYPE");
});

test("a missing conversation is 404, and a stranger is refused", () => {
  assert.equal(r.checkCanStart({ conversation: null, callerId: A, type: "voice", blocked: false, busy: [] }).status, 404);
  assert.equal(r.checkCanStart({ conversation: direct, callerId: C, type: "voice", blocked: false, busy: [] }).status, 403);
});

test("groups, course chats, saved messages and chats with other than two people cannot be called yet", () => {
  for (const conversation of [{ type: "group", participantIds: [A, B] }, { type: "course", participantIds: [A, B] }, { type: "self", participantIds: [A] }, { type: "direct", participantIds: [A, B, C] }, { type: "direct", participantIds: [A] }]) {
    const x = r.checkCanStart({ conversation, callerId: A, type: "voice", blocked: false, busy: [] });
    assert.equal(x.ok, false);
    assert.equal(x.code, "DIRECT_ONLY");
  }
});

test("a block in either direction stops the call", () => {
  const x = r.checkCanStart({ conversation: direct, callerId: A, type: "voice", blocked: true, busy: [] });
  assert.equal(x.status, 403);
  assert.equal(x.code, "BLOCKED");
});

test("busy people are told so, the caller before the callee", () => {
  assert.equal(r.checkCanStart({ conversation: direct, callerId: A, type: "voice", blocked: false, busy: [B] }).code, "CALLEE_BUSY");
  assert.equal(r.checkCanStart({ conversation: direct, callerId: A, type: "voice", blocked: false, busy: [A] }).code, "CALLER_BUSY");
  assert.equal(r.checkCanStart({ conversation: direct, callerId: A, type: "voice", blocked: false, busy: [A, B] }).code, "CALLER_BUSY");
  assert.equal(r.checkCanStart({ conversation: direct, callerId: A, type: "voice", blocked: false, busy: [C] }).ok, true);
});

test("only the person being called can accept or decline, and only while it rings", () => {
  for (const action of ["accept", "decline"]) {
    assert.equal(r.checkCanAct(call(), B, action, T0 + 1000).ok, true);
    assert.equal(r.checkCanAct(call(), A, action, T0 + 1000).code, "NOT_CALLEE");
    assert.equal(r.checkCanAct(call(), B, action, T0 + 60000).code, "NOT_RINGING");
    assert.equal(r.checkCanAct(call({ status: "ended" }), B, action, T0).code, "NOT_RINGING");
  }
});

test("a missed call says it was missed", () => {
  assert.match(r.checkCanAct(call(), B, "accept", T0 + 60000).message, /missed/i);
});

test("only the caller can cancel, and only while it rings", () => {
  assert.equal(r.checkCanAct(call(), A, "cancel", T0 + 1000).ok, true);
  assert.equal(r.checkCanAct(call(), B, "cancel", T0 + 1000).code, "NOT_CALLER");
  assert.equal(r.checkCanAct(call({ status: "active", answeredAt: new Date(T0) }), A, "cancel", T0 + 1000).code, "NOT_RINGING");
});

test("a stranger cannot even learn a call exists", () => {
  for (const action of ["read", "accept", "decline", "cancel", "end"]) {
    const x = r.checkCanAct(call(), C, action, T0);
    assert.equal(x.status, 404, action);
  }
  assert.equal(r.checkCanAct(null, A, "read").status, 404);
  assert.equal(r.checkCanAct(call(), A, "dance", T0).code, "BAD_ACTION");
});

test("either person may read and end", () => {
  assert.equal(r.checkCanAct(call(), A, "read", T0).ok, true);
  assert.equal(r.checkCanAct(call(), B, "read", T0).ok, true);
  assert.equal(r.checkCanAct(call(), B, "end", T0).ok, true);
});

test("duration is the seconds between answering and ending, and never negative or NaN", () => {
  assert.equal(r.durationSec(call({ answeredAt: new Date(T0), endedAt: new Date(T0 + 192000) })), 192);
  assert.equal(r.durationSec(call({ answeredAt: null, endedAt: new Date(T0) })), 0);
  assert.equal(r.durationSec(call({ answeredAt: new Date(T0 + 5000), endedAt: new Date(T0) })), 0);
  assert.equal(r.durationSec(null), 0);
});

test("durations read like a phone", () => {
  assert.equal(r.formatDuration(0), "0:00");
  assert.equal(r.formatDuration(5), "0:05");
  assert.equal(r.formatDuration(192), "3:12");
  assert.equal(r.formatDuration(3600), "1:00:00");
  assert.equal(r.formatDuration(3725), "1:02:05");
  assert.equal(r.formatDuration(-4), "0:00");
  assert.equal(r.formatDuration(NaN), "0:00");
});

test("the chat line for each way a call can finish", () => {
  const done = { answeredAt: new Date(T0), endedAt: new Date(T0 + 192000) };
  assert.match(r.callLogText(call({ ...done, status: "ended" })), /Voice call \u00B7 3:12$/);
  assert.match(r.callLogText(call({ ...done, status: "ended", type: "video" })), /Video call \u00B7 3:12$/);
  assert.match(r.callLogText(call({ status: "missed" })), /Missed voice call$/);
  assert.match(r.callLogText(call({ status: "cancelled", type: "video" })), /Missed video call$/);
  assert.match(r.callLogText(call({ status: "declined" })), /Declined voice call$/);
});

test("the shaped call names the other person, gives the direction, and never leaks the room", () => {
  const names = { [A]: "Amina", [B]: "Brian" };
  const forB = r.shapeCall(call(), B, names);
  assert.equal(forB.direction, "incoming");
  assert.equal(forB.callerName, "Amina");
  assert.equal(forB.otherName, "Amina");
  assert.equal(forB.otherId, A);
  const forA = r.shapeCall(call(), A, names);
  assert.equal(forA.direction, "outgoing");
  assert.equal(forA.otherName, "Brian");
  assert.ok(!("room" in forA) && !("token" in forA));
  assert.equal(r.shapeCall(call({ status: "ended", answeredAt: new Date(T0), endedAt: new Date(T0 + 7000) }), A, names).durationSec, 7);
});
