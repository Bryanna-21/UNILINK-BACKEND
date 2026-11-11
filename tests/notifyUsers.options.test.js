"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const path = require("path");

// notifyUsers talks to the database and to Expo's push service. Both are replaced here, so this
// checks exactly what it writes and who it pushes to.
const state = { inserted: [], upserts: [], pushed: [], alreadyThere: new Set() };
const stub = (rel, exports) => {
  const file = require.resolve(rel);
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};
stub("../src/models/UserNotification", {
  insertMany: async (rows) => { state.inserted.push(...rows); },
  updateOne: async (filter, update) => {
    state.upserts.push({ filter, update });
    const key = `${filter.recipientId}|${filter.type}|${filter.actorId}|${filter.postId}`;
    if (state.alreadyThere.has(key)) return { upsertedCount: 0 };
    state.alreadyThere.add(key);
    return { upsertedCount: 1 };
  },
});
stub("../src/models/User", { find: (q) => ({ select: async () => q._id.$in.map((id) => ({ _id: id, pushToken: `token-${id}` })) }) });
stub("../src/services/push.service", { sendToTokens: async (tokens, payload) => { state.pushed.push({ tokens, payload }); } });
const notifyUsers = require("../src/middleware/notifyUsers.middleware");

const reset = () => { state.inserted = []; state.upserts = []; state.pushed = []; state.alreadyThere = new Set(); };
const settle = () => new Promise((r) => setImmediate(r));

test("the old way still works: one row each, and a push", async () => {
  reset();
  await notifyUsers({ recipientIds: ["a", "b"], type: "grade_posted", title: "Grade", message: "m", link: "/x", context: { courseId: "c1" } });
  await settle();
  assert.equal(state.inserted.length, 2);
  assert.equal(state.inserted[0].courseId, "c1");
  assert.equal(state.inserted[0].actorId, null);
  assert.deepEqual(state.pushed[0].tokens, ["token-a", "token-b"]);
});

test("actor and post are stored with the notification", async () => {
  reset();
  await notifyUsers({ recipientIds: "a", type: "post_comment", title: "t", actorId: "u1", postId: "p1" });
  assert.equal(state.inserted[0].actorId, "u1");
  assert.equal(state.inserted[0].postId, "p1");
});

test("dedupe: the first time inserts and pushes, a repeat does neither", async () => {
  reset();
  const call = () => notifyUsers({ recipientIds: ["a"], type: "new_follower", title: "t", actorId: "u1", dedupe: true });
  await call();
  await settle();
  assert.equal(state.upserts.length, 1);
  assert.equal(state.pushed.length, 1);
  await call();
  await settle();
  assert.equal(state.upserts.length, 2, "it checked again");
  assert.equal(state.pushed.length, 1, "but sent no second push");
  assert.equal(state.inserted.length, 0, "and never used plain inserts");
});

test("dedupe: the upsert filter holds the identity, $setOnInsert holds the rest without repeating it", async () => {
  reset();
  await notifyUsers({ recipientIds: ["a"], type: "post_like", title: "t", message: "m", link: "/post/p1", actorId: "u1", postId: "p1", dedupe: true });
  const { filter, update } = state.upserts[0];
  assert.deepEqual(filter, { recipientId: "a", type: "post_like", actorId: "u1", postId: "p1" });
  for (const key of Object.keys(filter)) assert.ok(!(key in update.$setOnInsert), `${key} is not set twice`);
  assert.equal(update.$setOnInsert.read, false);
  assert.equal(update.$setOnInsert.title, "t");
});

test("dedupe with several people pushes only to the ones it was new for", async () => {
  reset();
  state.alreadyThere.add("b|post_like|u1|p1");
  await notifyUsers({ recipientIds: ["a", "b", "c"], type: "post_like", title: "t", actorId: "u1", postId: "p1", dedupe: true });
  await settle();
  assert.deepEqual(state.pushed[0].tokens, ["token-a", "token-c"]);
});

test("inApp:false (messages) writes nothing to the list but still pushes", async () => {
  reset();
  await notifyUsers({ recipientIds: ["a"], type: "new_message", title: "New message", message: "hi", link: "/messages/c1", inApp: false, context: { conversationId: "c1" } });
  await settle();
  assert.equal(state.inserted.length, 0);
  assert.equal(state.upserts.length, 0);
  assert.deepEqual(state.pushed[0].tokens, ["token-a"]);
  assert.equal(state.pushed[0].payload.data.type, "new_message");
});

test("no recipients does nothing", async () => {
  reset();
  await notifyUsers({ recipientIds: [], type: "post_like", title: "t" });
  await notifyUsers({ recipientIds: [null, undefined], type: "post_like", title: "t" });
  assert.equal(state.inserted.length + state.upserts.length + state.pushed.length, 0);
});
