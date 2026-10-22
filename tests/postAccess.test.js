"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { decidePostAccess, decideUserAccess } = require("../src/utils/postAccess");
const { createPostAccess } = require("../src/services/postAccess.service");
const { Coll, oid } = require("./enforcement.fakeDb");

const U1 = "uni000000000000000000a1", U2 = "uni000000000000000000b2";
const viewer = { id: "v1", role: "student", universityId: U1 };
const post = (extra = {}) => ({ userId: "author", universityId: U1, communityId: null, ...extra });

// ---------------------------------------------------------------- the pure rules
test("a post from the viewer's own university is visible", () => {
  assert.equal(decidePostAccess({ viewer, post: post() }).ok, true);
});

test("a post from another university is refused, and so is a post with no university", () => {
  assert.equal(decidePostAccess({ viewer, post: post({ universityId: U2 }) }).reason, "other_university");
  assert.equal(decidePostAccess({ viewer, post: post({ universityId: null }) }).reason, "other_university");
  assert.equal(decidePostAccess({ viewer: { ...viewer, universityId: null }, post: post() }).reason, "other_university");
});

test("someone blocked either way with the author cannot see the post", () => {
  assert.equal(decidePostAccess({ viewer, post: post(), blocked: true }).reason, "blocked");
});

test("the owner always sees their own post, even in a community they left", () => {
  assert.equal(decidePostAccess({ viewer, post: post({ userId: "v1", universityId: U2, communityId: "c1" }), communityAccess: false }).ok, true);
});

test("a community post needs membership, not the post's university", () => {
  assert.equal(decidePostAccess({ viewer, post: post({ communityId: "c1" }), communityAccess: false }).reason, "not_a_member");
  // a member from a connected university: the post's university differs and that is fine
  assert.equal(decidePostAccess({ viewer, post: post({ communityId: "c1", universityId: U2 }), communityAccess: true }).ok, true);
});

test("superadmins and platform admins are never refused; a university admin is scoped like everyone", () => {
  const p = post({ universityId: U2 });
  assert.equal(decidePostAccess({ viewer: { id: "s", role: "superadmin" }, post: p, blocked: true }).ok, true);
  assert.equal(decidePostAccess({ viewer: { id: "a", role: "admin", universityId: null }, post: p }).ok, true);
  assert.equal(decidePostAccess({ viewer: { id: "a", role: "admin", universityId: U1 }, post: p }).ok, false);
});

test("a deleted or missing viewer, or a missing post, is refused", () => {
  assert.equal(decidePostAccess({ viewer: null, post: post() }).ok, false);
  assert.equal(decidePostAccess({ viewer: { ...viewer, deletedAt: new Date() }, post: post() }).ok, false);
  assert.equal(decidePostAccess({ viewer, post: null }).ok, false);
});

test("a person is visible inside the viewer's university only, never across a block", () => {
  const target = { id: "t", universityId: U1 };
  assert.equal(decideUserAccess({ viewer, target }).ok, true);
  assert.equal(decideUserAccess({ viewer, target: { id: "t", universityId: U2 } }).reason, "other_university");
  assert.equal(decideUserAccess({ viewer, target, blocked: true }).reason, "blocked");
  assert.equal(decideUserAccess({ viewer, target: { id: "t", universityId: U2 }, scopeUniversity: false }).ok, true);
  assert.equal(decideUserAccess({ viewer, target: { id: "t", universityId: U2 }, scopeUniversity: false, blocked: true }).ok, false);
  assert.equal(decideUserAccess({ viewer, target: { id: "t", universityId: U1, deletedAt: new Date() } }).reason, "no_user");
});

// ---------------------------------------------------------------- with the facts loaded
function world() {
  const db = {
    User: new Coll([
      { _id: "v1", role: "student", universityId: U1 },
      { _id: "author", role: "student", universityId: U1 },
      { _id: "far", role: "student", universityId: U2 },
      { _id: "boss", role: "superadmin" },
    ]),
    Community: new Coll([
      { _id: "wide", type: "university-wide", universityId: U1 },
      { _id: "club", type: "club", universityId: U1 },
    ]),
    CommunityMembership: new Coll([{ _id: "m1", communityId: "club", userId: "v1", status: "active" }, { _id: "m2", communityId: "club", userId: "far", status: "pending" }]),
    Block: new Coll(),
  };
  return { db, svc: createPostAccess(db) };
}

test("service: own university yes, another university no", async () => {
  const w = world();
  assert.equal(await w.svc.canViewPost("v1", post()), true);
  assert.equal(await w.svc.canViewPost("far", post()), false); // the comments hole: a student of another university
  assert.equal(await w.svc.canViewPost("ghost", post()), false);
});

test("service: a block in either direction hides the post", async () => {
  const w = world();
  await w.db.Block.create({ blockerId: "v1", blockedId: "author" });
  assert.equal(await w.svc.canViewPost("v1", post()), false);
  assert.equal(await w.svc.canViewPost("author", post({ userId: "v1" })), false);
  assert.equal(await w.svc.canViewPost("boss", post()), true);
});

test("service: community posts follow membership", async () => {
  const w = world();
  assert.equal(await w.svc.canViewPost("v1", post({ communityId: "wide" })), true); // university-wide, same university
  assert.equal(await w.svc.canViewPost("v1", post({ communityId: "club" })), true); // active member
  assert.equal(await w.svc.canViewPost("far", post({ communityId: "club", universityId: U2 })), false); // pending only
  assert.equal(await w.svc.canViewPost("far", post({ communityId: "wide" })), false); // other university
  assert.equal(await w.svc.canViewPost("v1", post({ communityId: "missing" })), false);
});

test("service: blockedIdsFor lists the other party in both directions", async () => {
  const w = world();
  await w.db.Block.create({ blockerId: "v1", blockedId: "author" });
  await w.db.Block.create({ blockerId: "far", blockedId: "v1" });
  assert.deepEqual((await w.svc.blockedIdsFor("v1")).sort(), ["author", "far"]);
  assert.deepEqual(await w.svc.blockedIdsFor("boss"), []);
});

test("service: canViewUser applies the university and the block", async () => {
  const w = world();
  assert.equal(await w.svc.canViewUser("v1", "author"), true);
  assert.equal(await w.svc.canViewUser("v1", "far"), false);
  assert.equal(await w.svc.canViewUser("v1", "far", { scopeUniversity: false }), true);
  await w.db.Block.create({ blockerId: "author", blockedId: "v1" });
  assert.equal(await w.svc.canViewUser("v1", "author"), false);
  assert.equal(await w.svc.canViewUser("v1", "v1"), true);
});
