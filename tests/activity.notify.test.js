"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createActivityNotifier } = require("../src/services/activity.notify");

function setup({ users = {}, blocked = [], canView = () => true } = {}) {
  const sent = [];
  const notifier = createActivityNotifier({
    User: {
      findById: (id) => ({ select: () => ({ lean: async () => users[id] || null }) }),
      find: (filter) => ({ select: () => ({ lean: async () => Object.entries(users).filter(([, u]) => filter.username.$in.includes(u.username) && (!filter.universityId || u.universityId === filter.universityId)).map(([id]) => ({ _id: id })) }) }),
    },
    canViewPost: async (id, post) => canView(id, post),
    isBlockedEitherWay: async (a, b) => blocked.some(([x, y]) => (x === a && y === b) || (x === b && y === a)),
    notify: async (n) => { sent.push(n); },
    log: { error: () => {} },
  });
  return { notifier, sent };
}
const users = {
  u1: { name: "Amina", username: "amina", universityId: "uni1" },
  u2: { name: "Brian", username: "brian", universityId: "uni1" },
  u3: { name: "Cate", username: "cate_k", universityId: "uni1" },
  u9: { name: "Zed", username: "zed99", universityId: "uni2" },
};
const post = { _id: "p1", userId: "u2", title: "My notes", content: "", universityId: "uni1" };

test("following tells the person once, with the follower's name and profile link", async () => {
  const { notifier, sent } = setup({ users });
  await notifier.notifyFollow({ followerId: "u1", followingId: "u2" });
  assert.equal(sent.length, 1);
  assert.deepEqual(sent[0].recipientIds, ["u2"]);
  assert.equal(sent[0].type, "new_follower");
  assert.equal(sent[0].title, "Amina started following you");
  assert.equal(sent[0].link, "/user/u1");
  assert.equal(sent[0].dedupe, true);
});

test("a like tells the author, once per person (dedupe), never yourself", async () => {
  const { notifier, sent } = setup({ users });
  await notifier.notifyLike({ actorId: "u1", post });
  assert.equal(sent[0].type, "post_like");
  assert.deepEqual(sent[0].recipientIds, ["u2"]);
  assert.equal(sent[0].dedupe, true);
  assert.equal(sent[0].postId, "p1");
  assert.equal(sent[0].link, "/post/p1");
  sent.length = 0;
  await notifier.notifyLike({ actorId: "u2", post });
  assert.equal(sent.length, 0, "liking your own post tells nobody");
});

test("nobody is told across a block, in either direction", async () => {
  const { notifier, sent } = setup({ users, blocked: [["u2", "u1"]] });
  await notifier.notifyFollow({ followerId: "u1", followingId: "u2" });
  await notifier.notifyLike({ actorId: "u1", post });
  await notifier.notifyComment({ actorId: "u1", post, comment: { content: "hi" } });
  assert.equal(sent.length, 0);
});

test("a comment tells the author, and every comment counts (no dedupe)", async () => {
  const { notifier, sent } = setup({ users });
  await notifier.notifyComment({ actorId: "u1", post, comment: { content: "Great notes" } });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, "post_comment");
  assert.equal(sent[0].dedupe, false);
  assert.equal(sent[0].message, "Great notes");
  assert.equal(sent[0].title, "Amina commented on your post");
});

test("a comment that mentions people tells them too, and the author is not told twice", async () => {
  const { notifier, sent } = setup({ users });
  await notifier.notifyComment({ actorId: "u1", post, comment: { content: "@cate_k look at this" } });
  assert.deepEqual(sent.map((n) => [n.type, n.recipientIds]), [["post_comment", ["u2"]], ["mention", ["u3"]]]);
  sent.length = 0;
  await notifier.notifyComment({ actorId: "u1", post, comment: { content: "@brian you should see this" } });
  assert.deepEqual(sent.map((n) => [n.type, n.recipientIds]), [["mention", ["u2"]]], "the author is mentioned, so one alert, the mention");
});

test("a post that mentions people tells them once, and not the writer", async () => {
  const { notifier, sent } = setup({ users });
  await notifier.notifyPostMentions({ actorId: "u1", post: { _id: "p2", userId: "u1", title: "Study group", content: "with @brian and @cate_k and @amina", universityId: "uni1" } });
  assert.equal(sent.length, 1);
  assert.equal(sent[0].type, "mention");
  assert.deepEqual(sent[0].recipientIds.sort(), ["u2", "u3"]);
  assert.equal(sent[0].dedupe, true);
});

test("mentions never cross universities, and respect who may see the post", async () => {
  const { notifier, sent } = setup({ users, canView: (id) => id !== "u3" });
  await notifier.notifyPostMentions({ actorId: "u1", post: { _id: "p3", userId: "u1", content: "@zed99 @cate_k @brian", universityId: "uni1" } });
  assert.deepEqual(sent[0].recipientIds, ["u2"], "zed is at another university, cate cannot see the post");
});

test("a post with no mentions sends nothing", async () => {
  const { notifier, sent } = setup({ users });
  await notifier.notifyPostMentions({ actorId: "u1", post: { _id: "p4", userId: "u1", content: "plain text", universityId: "uni1" } });
  assert.equal(sent.length, 0);
});

test("a failure inside never escapes to the action that caused it", async () => {
  const notifier = createActivityNotifier({
    User: { findById: () => { throw new Error("database down"); }, find: () => { throw new Error("database down"); } },
    canViewPost: async () => true,
    isBlockedEitherWay: async () => false,
    notify: async () => {},
    log: { error: () => {} },
  });
  assert.equal(await notifier.notifyFollow({ followerId: "u1", followingId: "u2" }), 0);
  assert.equal(await notifier.notifyLike({ actorId: "u1", post }), 0);
  assert.equal(await notifier.notifyComment({ actorId: "u1", post, comment: { content: "x" } }), 0);
  assert.equal(await notifier.notifyPostMentions({ actorId: "u1", post: { ...post, content: "@brian" } }), 0);
});
