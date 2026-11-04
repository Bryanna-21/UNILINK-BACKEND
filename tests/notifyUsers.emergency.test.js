"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

const state = { inserted: [], pushed: [] };
const stub = (rel, exports) => {
  const file = require.resolve(rel);
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};
stub("../src/models/UserNotification", { insertMany: async (rows) => { state.inserted.push(...rows); }, updateOne: async () => ({ upsertedCount: 1 }) });
stub("../src/models/User", { find: (q) => ({ select: async () => q._id.$in.map((id) => ({ _id: id, pushToken: `token-${id}` })) }) });
stub("../src/services/push.service", { sendToTokens: async (tokens, payload) => { state.pushed.push({ tokens, payload }); } });
const notifyUsers = require("../src/middleware/notifyUsers.middleware");
const settle = () => new Promise((r) => setImmediate(r));

test("an emergency alert stores the report id and pushes on the emergency channel with the alert details", async () => {
  await notifyUsers({
    recipientIds: ["a", "b"], type: "emergency_alert", title: "🚨 SOS from Amina", message: "Library", link: "/emergency/r1",
    actorId: "student", reportId: "r1", channelId: "emergency", pushData: { reportId: "r1", ring: "1", student: "Amina" },
  });
  await settle();
  assert.equal(state.inserted.length, 2);
  assert.equal(state.inserted[0].reportId, "r1");
  assert.equal(state.inserted[0].actorId, "student");
  assert.equal(state.pushed[0].payload.channelId, "emergency");
  assert.deepEqual(state.pushed[0].payload.data, { type: "emergency_alert", link: "/emergency/r1", reportId: "r1", ring: "1", student: "Amina" });
});

test("an ordinary notification has no channel and no extra data", async () => {
  state.pushed.length = 0;
  await notifyUsers({ recipientIds: ["a"], type: "grade_posted", title: "t", message: "m", link: "/x" });
  await settle();
  assert.equal(state.pushed[0].payload.channelId, null);
  assert.deepEqual(state.pushed[0].payload.data, { type: "grade_posted", link: "/x" });
});
