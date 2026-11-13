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

test("a person is visible across universities, but never across a block", () => {
  const target = { id: "t", universityId: U1 };
  assert.equal(decideUserAccess({ viewer, target }).ok, true);
  assert.equal(decideUserAccess({ viewer, target: { id: "t", universityId: U2 } }).ok, true, "following is universal");
  assert.equal(decideUserAccess({ viewer: { ...viewer, universityId: null }, target }).ok, true);
  assert.equal(decideUserAccess({ viewer, target: { id: "t", universityId: U2 }, scopeUniversity: true }).reason, "other_university", "the old rule is still available");
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

test("service: canViewUser is universal and applies the block", async () => {
  const w = world();
  assert.equal(await w.svc.canViewUser("v1", "author"), true);
  assert.equal(await w.svc.canViewUser("v1", "far"), true);
  assert.equal(await w.svc.canViewUser("v1", "far", { scopeUniversity: true }), false);
  await w.db.Block.create({ blockerId: "author", blockedId: "v1" });
  assert.equal(await w.svc.canViewUser("v1", "author"), false);
  assert.equal(await w.svc.canViewUser("v1", "v1"), true);
});

// ---------------------------------------------------------------- audiences
test("audience: a post with no audience, or 'university', is for the author's university only", () => {
  assert.equal(decidePostAccess({ viewer, post: post({ audience: "university" }) }).ok, true);
  assert.equal(decidePostAccess({ viewer, post: post({ audience: "university", universityId: U2 }) }).reason, "other_university");
});

test("audience: everyone means any signed-in person, even with no university, but never across a block", () => {
  const p = post({ audience: "everyone", universityId: U2 });
  assert.equal(decidePostAccess({ viewer, post: p }).ok, true);
  assert.equal(decidePostAccess({ viewer: { ...viewer, universityId: null }, post: p }).ok, true);
  assert.equal(decidePostAccess({ viewer, post: p, blocked: true }).reason, "blocked");
});

test("audience: chosen universities", () => {
  const p = post({ audience: "universities", audienceUniversityIds: [U1, "uni000000000000000000c3"], universityId: U2 });
  assert.equal(decidePostAccess({ viewer, post: p }).ok, true);
  assert.equal(decidePostAccess({ viewer: { ...viewer, universityId: "uni000000000000000000d4" }, post: p }).reason, "not_in_audience");
  assert.equal(decidePostAccess({ viewer: { ...viewer, universityId: null }, post: p }).reason, "not_in_audience");
});

test("audience: followers need a follow, friends need a follow both ways, people need to be on the list", () => {
  const followers = post({ audience: "followers", universityId: U2 });
  assert.equal(decidePostAccess({ viewer, post: followers }).reason, "not_in_audience");
  assert.equal(decidePostAccess({ viewer, post: followers, follows: { viewerFollowsAuthor: true } }).ok, true);
  const friends = post({ audience: "friends", universityId: U2 });
  assert.equal(decidePostAccess({ viewer, post: friends, follows: { viewerFollowsAuthor: true } }).ok, false);
  assert.equal(decidePostAccess({ viewer, post: friends, follows: { authorFollowsViewer: true } }).ok, false);
  assert.equal(decidePostAccess({ viewer, post: friends, follows: { viewerFollowsAuthor: true, authorFollowsViewer: true } }).ok, true);
  const people = post({ audience: "people", audienceUserIds: ["v1", "x"], universityId: U2 });
  assert.equal(decidePostAccess({ viewer, post: people }).ok, true);
  assert.equal(decidePostAccess({ viewer: { ...viewer, id: "other" }, post: people }).ok, false);
});

test("audience: the author, and platform moderators, always see the post; a community post ignores the audience", () => {
  const p = post({ audience: "people", audienceUserIds: ["x"], universityId: U2 });
  assert.equal(decidePostAccess({ viewer: { ...viewer, id: "author" }, post: p }).ok, true);
  assert.equal(decidePostAccess({ viewer: { id: "s", role: "superadmin" }, post: p }).ok, true);
  assert.equal(decidePostAccess({ viewer, post: post({ audience: "everyone", communityId: "c1" }), communityAccess: false }).reason, "not_a_member");
});

test("audience: an unknown audience value is closed, never open", () => {
  assert.equal(decidePostAccess({ viewer, post: post({ audience: "whoever" }) }).ok, false);
});

test("service: followers-only and friends-only posts read the follow records", async () => {
  const w = world();
  w.db.Follow = new Coll();
  const svc = createPostAccess(w.db);
  const followersPost = post({ audience: "followers", universityId: U2, userId: "far" });
  assert.equal(await svc.canViewPost("v1", followersPost), false);
  await w.db.Follow.create({ followerId: "v1", followingId: "far" });
  assert.equal(await svc.canViewPost("v1", followersPost), true);
  const friendsPost = post({ audience: "friends", universityId: U2, userId: "far" });
  assert.equal(await svc.canViewPost("v1", friendsPost), false, "far does not follow back yet");
  await w.db.Follow.create({ followerId: "far", followingId: "v1" });
  assert.equal(await svc.canViewPost("v1", friendsPost), true);
  assert.equal(await svc.canViewPost("author", friendsPost), false, "a stranger who follows nobody");
});

test("service: visibleFilter is false for a missing viewer and null for a platform moderator", async () => {
  const w = world();
  w.db.Follow = new Coll();
  const svc = createPostAccess(w.db);
  assert.equal(await svc.visibleFilter("ghost"), false);
  assert.equal(await svc.visibleFilter("boss"), null);
  const f = await svc.visibleFilter("v1");
  assert.ok(Array.isArray(f.$or) && f.$or.length >= 7);
});
