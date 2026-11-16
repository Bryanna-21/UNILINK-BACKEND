"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { attachActors } = require("../src/services/notificationActors");

const hex = (n) => String(n).padStart(24, "0");
const User = (rows) => ({ calls: [], find(f) { this.calls.push(f); const ids = f._id.$in.map(String); const out = rows.filter((r) => ids.includes(String(r._id))); const o = { select: () => o, lean: async () => out }; return o; } });

test("each notification gets who did it, with their photo, from ONE query", async () => {
  const U = User([{ _id: hex(1), name: "Amina", avatarUrl: "https://x/a.jpg" }, { _id: hex(2), name: "Brian", avatarUrl: null }]);
  const out = await attachActors(U, [{ _id: "n1", actorId: hex(1) }, { _id: "n2", actorId: hex(2) }, { _id: "n3", actorId: hex(1) }]);
  assert.equal(U.calls.length, 1);
  assert.equal(U.calls[0]._id.$in.length, 2, "each person is asked for once");
  assert.deepEqual(out.map((n) => [n.actorName, n.actorAvatarUrl]), [["Amina", "https://x/a.jpg"], ["Brian", null], ["Amina", "https://x/a.jpg"]]);
  assert.equal(out[0]._id, "n1", "the rest of the row is kept");
});

test("a person who is gone, a missing actor, or a bad id just has no name or photo", async () => {
  const U = User([]);
  const out = await attachActors(U, [{ _id: "n1", actorId: hex(9) }, { _id: "n2", actorId: null }, { _id: "n3" }, { _id: "n4", actorId: "not-an-id" }]);
  assert.ok(out.every((n) => n.actorName === null && n.actorAvatarUrl === null));
});

test("no actors at all means no query", async () => {
  const U = User([]);
  await attachActors(U, [{ _id: "n1", actorId: null }]);
  assert.equal(U.calls.length, 0);
});
