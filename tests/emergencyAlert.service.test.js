"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createEmergencyAlerts } = require("../src/services/emergencyAlert.service");

const U_A = "a".repeat(24), U_B = "b".repeat(24);
const isExpoToken = (t) => typeof t === "string" && /^ExponentPushToken\[[^\]]+\]$/.test(t);
const quiet = { warn() {}, error() {} };

const chain = (v) => {
  const o = { select: () => o, lean: () => o, then: (res, rej) => Promise.resolve(v).then(res, rej) };
  return o;
};

const ADMINS = [
  { _id: "s1", role: "superadmin", universityId: null, pushToken: "ExponentPushToken[super]" },
  { _id: "a1", role: "admin", universityId: U_A, pushToken: "ExponentPushToken[adminA]" },
  { _id: "p1", role: "admin", universityId: null, pushToken: null },
  { _id: "b1", role: "admin", universityId: U_B, pushToken: "ExponentPushToken[adminB]" },
];

function build(over = {}) {
  const calls = { notifications: [], pushes: [], live: [], cleared: [], find: [] };
  const deps = {
    User: {
      find: (q) => { calls.find.push(q); return chain(ADMINS); },
      findById: () => chain({ name: "Amina Otieno" }),
      updateMany: async (...a) => { calls.cleared.push(a); },
    },
    Notification: { insertMany: async (rows) => { calls.notifications.push(...rows); } },
    sendPushBatch: async (msgs) => { calls.pushes.push(...msgs); return { sent: msgs.length, failed: 0, invalidTokens: [] }; },
    isExpoToken,
    emitToUsers: (ids, event, payload) => { calls.live.push({ ids, event, payload }); },
    log: quiet,
    ...over,
  };
  return { svc: createEmergencyAlerts(deps), calls };
}

const sos = { _id: "r1", userId: "u1", universityId: U_A, type: "sos", location: "Library", message: "" };

test("an SOS from university A alerts the superadmin, the platform admin and A's admin, not B's", async () => {
  const { svc, calls } = build();
  const s = await svc.alertAdmins({ report: sos, isSOS: true });
  assert.equal(s.recipients, 3);
  assert.deepEqual(calls.notifications.map((n) => n.recipientId).sort(), ["a1", "p1", "s1"]);
  assert.deepEqual(calls.live[0].ids.sort(), ["a1", "p1", "s1"]);
  assert.equal(calls.live[0].event, "emergency-alert");
  assert.ok(!calls.live[0].ids.includes("b1"));
});

test("an SOS push is loud, only goes to real tokens, and says who needs help", async () => {
  const { svc, calls } = build();
  const s = await svc.alertAdmins({ report: sos, isSOS: true });
  assert.deepEqual(calls.pushes.map((m) => m.to).sort(), ["ExponentPushToken[adminA]", "ExponentPushToken[super]"]);
  assert.ok(calls.pushes.every((m) => m.channelId === "emergency" && m.priority === "high"));
  assert.match(calls.pushes[0].body, /Amina Otieno needs help near Library/);
  assert.deepEqual(s.pushed, { sent: 2, failed: 0 });
});

test("a normal report is quiet and its event name differs", async () => {
  const { svc, calls } = build();
  await svc.alertAdmins({ report: { ...sos, type: "medical", message: "fainted" }, isSOS: false });
  assert.ok(calls.pushes.every((m) => m.channelId === "default" && !("ttl" in m)));
  assert.equal(calls.live[0].event, "emergency-report");
  assert.equal(calls.notifications[0].type, "new_emergency_report");
});

test("only active, not-removed admins are asked for", async () => {
  const { svc, calls } = build();
  await svc.alertAdmins({ report: sos, isSOS: true });
  const q = calls.find[0];
  assert.deepEqual(q.role, { $in: ["admin", "superadmin"] });
  assert.equal(q.status, "active");
  assert.equal(q.deletedAt, null);
  assert.equal(q.removedAt, null);
});

test("a report with no university reaches the superadmin and platform admin only", async () => {
  const { svc, calls } = build();
  await svc.alertAdmins({ report: { ...sos, universityId: undefined }, isSOS: true });
  assert.deepEqual(calls.notifications.map((n) => n.recipientId).sort(), ["p1", "s1"]);
});

test("no admin at all: nothing is sent and it does not throw", async () => {
  const { svc, calls } = build({ User: { find: () => chain([]), findById: () => chain({ name: "X" }), updateMany: async () => {} } });
  const s = await svc.alertAdmins({ report: sos, isSOS: true });
  assert.equal(s.recipients, 0);
  assert.equal(calls.pushes.length, 0);
});

test("if recording fails, the live event and the push still go out", async () => {
  const { svc, calls } = build({ Notification: { insertMany: async () => { throw new Error("db down"); } } });
  const s = await svc.alertAdmins({ report: sos, isSOS: true });
  assert.equal(s.recorded, 0);
  assert.equal(calls.live.length, 1);
  assert.equal(calls.pushes.length, 2);
});

test("if the live event fails, the push still goes out", async () => {
  const { svc, calls } = build({ emitToUsers: () => { throw new Error("no socket"); } });
  const s = await svc.alertAdmins({ report: sos, isSOS: true });
  assert.equal(s.live, false);
  assert.equal(calls.pushes.length, 2);
  assert.equal(calls.notifications.length, 3);
});

test("if the push fails, the rows and the live event are already done and nothing throws", async () => {
  const { svc, calls } = build({ sendPushBatch: async () => { throw new Error("expo down"); } });
  const s = await svc.alertAdmins({ report: sos, isSOS: true });
  assert.equal(s.recorded, 3);
  assert.equal(calls.live.length, 1);
  assert.deepEqual(s.pushed, { sent: 0, failed: 0 });
});

test("tokens Expo says are dead are forgotten", async () => {
  const { svc, calls } = build({ sendPushBatch: async () => ({ sent: 1, failed: 1, invalidTokens: ["ExponentPushToken[adminA]"] }) });
  await svc.alertAdmins({ report: sos, isSOS: true });
  assert.equal(calls.cleared.length, 1);
  assert.deepEqual(calls.cleared[0][0], { pushToken: { $in: ["ExponentPushToken[adminA]"] } });
});

test("even a total failure of the first lookup never throws", async () => {
  const { svc } = build({ User: { find: () => { throw new Error("boom"); }, findById: () => chain(null), updateMany: async () => {} } });
  const s = await svc.alertAdmins({ report: sos, isSOS: true });
  assert.equal(s.recipients, 0);
});
