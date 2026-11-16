"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { removePostLeftovers, trimResharesForAudience } = require("../src/services/postCleanup");

const silent = { error: () => {} };
// A tiny fake collection that understands the few filters the cleanup uses.
function coll(rows = []) {
  const c = { rows, deleted: [] };
  const match = (r, f) => Object.entries(f).every(([k, v]) => {
    if (v && typeof v === "object" && "$in" in v) return v.$in.map(String).includes(String(r[k]));
    if (v && typeof v === "object" && "$ne" in v) return String(r[k] ?? null) !== String(v.$ne);
    return String(r[k]) === String(v);
  });
  c.find = (f) => { const out = c.rows.filter((r) => match(r, f)); const o = { select: () => o, lean: async () => out }; return o; };
  c.deleteMany = async (f) => { const gone = c.rows.filter((r) => match(r, f)); c.rows = c.rows.filter((r) => !match(r, f)); c.deleted.push(...gone); return { deletedCount: gone.length }; };
  return c;
}
const world = () => ({
  Post: coll([
    { _id: "orig", universityId: "A" },
    { _id: "rA", reshareOf: "orig", universityId: "A" },
    { _id: "rB", reshareOf: "orig", universityId: "B" },
    { _id: "other", universityId: "A" },
  ]),
  Comment: coll([{ _id: "c1", postId: "orig" }, { _id: "c2", postId: "rB" }, { _id: "c3", postId: "other" }]),
  Like: coll([{ _id: "l1", postId: "orig" }, { _id: "l2", postId: "rA" }, { _id: "l3", postId: "other" }]),
  HiddenPost: coll([{ _id: "h1", postId: "orig" }, { _id: "h2", postId: "other" }]),
  UserNotification: coll([{ _id: "n1", postId: "orig" }, { _id: "n2", postId: "other" }]),
});

test("deleting a post removes its comments, likes, hidden rows, notifications and reshares, and nothing else", async () => {
  const m = world();
  const out = await removePostLeftovers(m, "orig", silent);
  assert.equal(out.reshares, 2);
  assert.deepEqual(m.Comment.rows.map((r) => r._id), ["c3"], "comments on the post and on its reshares are gone");
  assert.deepEqual(m.Like.rows.map((r) => r._id), ["l3"]);
  assert.deepEqual(m.HiddenPost.rows.map((r) => r._id), ["h2"]);
  assert.deepEqual(m.UserNotification.rows.map((r) => r._id), ["n2"]);
  assert.deepEqual(m.Post.rows.map((r) => r._id).sort(), ["orig", "other"], "the reshares went; the post itself is deleted by the caller");
});

test("a failing step does not stop the others and nothing throws", async () => {
  const m = world();
  m.Comment.deleteMany = async () => { throw new Error("db hiccup"); };
  const out = await removePostLeftovers(m, "orig", silent);
  assert.equal(out.reshares, 2);
  assert.deepEqual(m.Like.rows.map((r) => r._id), ["l3"]);
});

test("a post with no reshares is fine", async () => {
  const m = world();
  assert.equal((await removePostLeftovers(m, "other", silent)).reshares, 0);
  assert.equal(m.Post.rows.length, 4);
});

test("audience 'everyone': every reshare stays", async () => {
  const m = world();
  assert.deepEqual(await trimResharesForAudience(m, { _id: "orig", universityId: "A" }, "everyone", silent), { removed: 0 });
  assert.equal(m.Post.rows.length, 4);
});

test("audience 'university': only reshares from other universities go, with their comments and likes", async () => {
  const m = world();
  assert.deepEqual(await trimResharesForAudience(m, { _id: "orig", universityId: "A" }, "university", silent), { removed: 1 });
  assert.deepEqual(m.Post.rows.map((r) => r._id).sort(), ["orig", "other", "rA"]);
  assert.deepEqual(m.Comment.rows.map((r) => r._id).sort(), ["c1", "c3"]);
});

test("any narrower audience removes every reshare", async () => {
  for (const audience of ["universities", "followers", "friends", "people"]) {
    const m = world();
    assert.deepEqual(await trimResharesForAudience(m, { _id: "orig", universityId: "A" }, audience, silent), { removed: 2 }, audience);
    assert.deepEqual(m.Post.rows.map((r) => r._id).sort(), ["orig", "other"]);
  }
});
