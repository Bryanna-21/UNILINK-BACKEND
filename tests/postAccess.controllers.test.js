"use strict";
// Runs the REAL controllers with only the database methods faked, to prove the access rules are
// actually wired into every endpoint (university, private communities, blocking).
const test = require("node:test");
const assert = require("node:assert/strict");

const Post = require("../src/models/Post");
const Comment = require("../src/models/Comment");
const User = require("../src/models/User");
const Like = require("../src/models/Like");
const Follow = require("../src/models/Follow");
const Block = require("../src/models/Block");
const HiddenPost = require("../src/models/HiddenPost");
const Community = require("../src/models/Community");
const CommunityMembership = require("../src/models/CommunityMembership");
const communityController = require("../src/controllers/community.controller");
const UserNotification = require("../src/models/UserNotification");
const postController = require("../src/controllers/post.controller");
const followController = require("../src/controllers/follow.controller");
const profileController = require("../src/controllers/profile.controller");

const hex = (n) => String(n).padStart(24, "0");
const U1 = hex(101), U2 = hex(102);
const ME = hex(1), AUTHOR = hex(2), FAR = hex(3), BLOCKED = hex(4);
const P_OWN = hex(11), P_FAR = hex(12), P_CLUB = hex(13), P_EVERYONE = hex(14), P_FOLLOWERS = hex(15), P_PEOPLE = hex(16);
const CLUB = hex(21);

const chain = (v) => {
  const o = { select: () => o, sort: () => o, limit: () => o, skip: () => o, populate: () => o, lean: () => o, then: (res, rej) => Promise.resolve(v).then(res, rej) };
  return o;
};
const match = (doc, f) => Object.entries(f).every(([k, c]) => (c && typeof c === "object" && "$in" in c ? c.$in.map(String).includes(String(doc[k])) : String(doc[k]) === String(c)));

function setup({ blocks = [], follows = [] } = {}) {
  const saved = {};
  const patch = (obj, name, fn) => { saved[obj.modelName + "." + name] = [obj, name, obj[name]]; obj[name] = fn; };
  const users = [
    { _id: ME, role: "student", universityId: U1, name: "Me" },
    { _id: AUTHOR, role: "student", universityId: U1, name: "Author" },
    { _id: FAR, role: "student", universityId: U2, name: "Far" },
    { _id: BLOCKED, role: "student", universityId: U1, name: "Blocked" },
  ];
  const posts = [
    { _id: P_OWN, userId: AUTHOR, universityId: U1, communityId: null, content: "hi", media: [] },
    { _id: P_FAR, userId: FAR, universityId: U2, communityId: null, content: "other uni", media: [] },
    { _id: P_CLUB, userId: AUTHOR, universityId: U1, communityId: CLUB, content: "club", media: [] },
    { _id: P_EVERYONE, userId: FAR, universityId: U2, communityId: null, audience: "everyone", content: "for everyone", media: [] },
    { _id: P_FOLLOWERS, userId: FAR, universityId: U2, communityId: null, audience: "followers", content: "followers only", media: [] },
    { _id: P_PEOPLE, userId: FAR, universityId: U2, communityId: null, audience: "people", audienceUserIds: [ME], content: "picked people", media: [] },
  ];
  const comments = [
    { _id: hex(31), postId: P_OWN, userId: AUTHOR, content: "from author" },
    { _id: hex(32), postId: P_OWN, userId: BLOCKED, content: "from blocked" },
    { _id: hex(33), postId: P_FAR, userId: FAR, content: "secret from another university" },
  ];
  const calls = { postFind: [], likeCreated: 0, commentCreated: 0 };
  patch(User, "findById", (id) => chain(users.find((u) => u._id === String(id)) || null));
  patch(User, "find", () => chain(users));
  patch(Post, "findById", (id) => chain(posts.find((p) => p._id === String(id)) || null));
  patch(Post, "find", (f) => { calls.postFind.push(f); return chain([]); });
  patch(Post, "countDocuments", () => chain(0));
  patch(Comment, "find", (f) => chain(comments.filter((c) => match(c, f))));
  patch(Comment, "countDocuments", () => chain(0));
  patch(Comment, "create", async () => { calls.commentCreated++; return { _id: hex(99) }; });
  patch(HiddenPost, "find", () => chain([]));
  patch(Follow, "countDocuments", () => chain(0));
  patch(Follow, "exists", async (f) => (follows.some((x) => x.followerId === f.followerId && x.followingId === f.followingId) ? { _id: "f" } : null));
  patch(Like, "findOne", () => chain(null));
  patch(Like, "find", () => chain([]));
  patch(Like, "create", async () => { calls.likeCreated++; return {}; });
  patch(Follow, "find", (f) => chain([{ followerId: AUTHOR }, { followerId: BLOCKED }, { followerId: FAR }].filter(() => true)));
  patch(Block, "find", (f) => chain(blocks.filter((b) => f.$or.some((c) => (!c.blockerId || b.blockerId === c.blockerId) && (!c.blockedId || b.blockedId === c.blockedId)))));
  patch(Block, "findOne", (f) => chain(blocks.find((b) => f.$or.some((c) => b.blockerId === c.blockerId && b.blockedId === c.blockedId)) || null));
  patch(Community, "findById", (id) => chain(id === CLUB ? { _id: CLUB, type: "club", universityId: U1 } : null));
  patch(CommunityMembership, "findOne", (f) => chain(f.userId === ME && f.communityId === CLUB && f.status === "active" ? { _id: "m" } : null));
  const restore = () => Object.values(saved).forEach(([obj, name, fn]) => { obj[name] = fn; });
  return { calls, restore, users };
}

const call = async (handler, { params = {}, body = {}, query = {}, as = ME, role = "student", universityId = U1 } = {}) => {
  const out = { status: 200, body: null };
  const res = { status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; } };
  await handler({ params, body, query, user: { id: as, role, universityId } }, res);
  return out;
};

test("comments: another university's post gives 404, not its comments (the hole)", async () => {
  const w = setup();
  try {
    const r = await call(postController.getComments, { params: { id: P_FAR } });
    assert.equal(r.status, 404);
    assert.equal(JSON.stringify(r.body).includes("secret"), false);
  } finally { w.restore(); }
});

test("comments: own university works, and a blocked person's comments are hidden", async () => {
  const w = setup({ blocks: [{ blockerId: ME, blockedId: BLOCKED }] });
  try {
    const r = await call(postController.getComments, { params: { id: P_OWN } });
    assert.equal(r.status, 200);
    assert.deepEqual(r.body.data.map((c) => c.content), ["from author"]);
  } finally { w.restore(); }
});

test("comments: a private community post is for members only", async () => {
  const w = setup();
  try {
    assert.equal((await call(postController.getComments, { params: { id: P_CLUB } })).status, 200); // ME is an active member
    assert.equal((await call(postController.getComments, { params: { id: P_CLUB }, as: BLOCKED })).status, 404); // not a member
  } finally { w.restore(); }
});

test("posting a comment: another university is refused and nothing is written", async () => {
  const w = setup();
  try {
    const r = await call(postController.addComment, { params: { id: P_FAR }, body: { content: "hello" } });
    assert.equal(r.status, 404);
    assert.equal(w.calls.commentCreated, 0);
  } finally { w.restore(); }
});

test("posting a comment: across a block is refused, in either direction", async () => {
  const w = setup({ blocks: [{ blockerId: AUTHOR, blockedId: ME }] });
  try {
    const r = await call(postController.addComment, { params: { id: P_OWN }, body: { content: "hello" } });
    assert.equal(r.status, 404);
    assert.equal(w.calls.commentCreated, 0);
  } finally { w.restore(); }
});

test("liking: another university or a blocked author gives 404 and no like is made", async () => {
  const w = setup({ blocks: [{ blockerId: ME, blockedId: AUTHOR }] });
  try {
    assert.equal((await call(postController.likePost, { params: { id: P_FAR } })).status, 404);
    assert.equal((await call(postController.likePost, { params: { id: P_OWN } })).status, 404);
    assert.equal(w.calls.likeCreated, 0);
  } finally { w.restore(); }
});

test("one post: another university and a block both give 404", async () => {
  const w = setup({ blocks: [] });
  try {
    assert.equal((await call(postController.getPostById, { params: { id: P_FAR } })).status, 404);
    assert.equal((await call(postController.getPostById, { params: { id: P_OWN } })).status, 200);
  } finally { w.restore(); }
  const w2 = setup({ blocks: [{ blockerId: AUTHOR, blockedId: ME }] });
  try { assert.equal((await call(postController.getPostById, { params: { id: P_OWN } })).status, 404); } finally { w2.restore(); }
});

test("feed: blocked authors are excluded from the query", async () => {
  const w = setup({ blocks: [{ blockerId: ME, blockedId: BLOCKED }, { blockerId: FAR, blockedId: ME }] });
  try {
    await call(postController.getFeed, { query: {} });
    const used = w.calls.postFind.find((f) => f && f.userId && f.userId.$nin);
    assert.ok(used, "the feed query must exclude blocked authors");
    assert.deepEqual(used.userId.$nin.sort(), [BLOCKED, FAR].sort());
  } finally { w.restore(); }
});

test("follower lists: people at another university can be opened; blocked people are filtered out", async () => {
  const w = setup({ blocks: [{ blockerId: ME, blockedId: BLOCKED }] });
  try {
    assert.equal((await call(followController.getFollowers, { params: { userId: FAR } })).status, 200);
    assert.equal((await call(followController.getFollowers, { params: { userId: BLOCKED } })).status, 404);
    const r = await call(followController.getFollowers, { params: { userId: AUTHOR } });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.some((u) => String(u._id) === BLOCKED), false);
  } finally { w.restore(); }
});

test("profile summary: a blocked person is not found, others are", async () => {
  const w = setup({ blocks: [{ blockerId: ME, blockedId: BLOCKED }] });
  try {
    assert.equal((await call(profileController.getUserSummary, { params: { userId: BLOCKED } })).status, 404);
    assert.equal((await call(profileController.getUserSummary, { params: { userId: AUTHOR } })).status, 200);
  } finally { w.restore(); }
});

test("a platform admin still sees everything (moderation must not be blocked)", async () => {
  const w = setup({ blocks: [{ blockerId: AUTHOR, blockedId: hex(7) }] });
  try {
    w.users.push({ _id: hex(7), role: "superadmin", name: "Boss" });
    const r = await call(postController.getComments, { params: { id: P_FAR }, as: hex(7), role: "superadmin", universityId: null });
    assert.equal(r.status, 200);
  } finally { w.restore(); }
});

test("audience: a post meant for everyone, or for me by name, opens across universities; a followers-only one needs a follow", async () => {
  const w = setup();
  try {
    assert.equal((await call(postController.getPostById, { params: { id: P_EVERYONE } })).status, 200);
    assert.equal((await call(postController.getPostById, { params: { id: P_PEOPLE } })).status, 200);
    assert.equal((await call(postController.getPostById, { params: { id: P_FOLLOWERS } })).status, 404);
    assert.equal((await call(postController.likePost, { params: { id: P_FOLLOWERS } })).status, 404);
    assert.equal(w.calls.likeCreated, 0);
  } finally { w.restore(); }
  const w2 = setup({ follows: [{ followerId: ME, followingId: FAR }] });
  try {
    assert.equal((await call(postController.getPostById, { params: { id: P_FOLLOWERS } })).status, 200);
  } finally { w2.restore(); }
});

test("feed: the query is the audience filter, not 'my university'", async () => {
  const w = setup();
  try {
    await call(postController.getFeed, { query: {} });
    const used = w.calls.postFind.find((f) => f && f.communityId === null);
    assert.ok(used, "the feed queried posts");
    assert.equal(used.universityId, undefined, "no longer limited to one university");
    assert.ok(Array.isArray(used.$and) && Array.isArray(used.$and[0].$or), "the audience filter is applied");
    assert.ok(used.$and[0].$or.some((b) => b.audience === "everyone"));
  } finally { w.restore(); }
});

test("feed: a platform moderator is not restricted", async () => {
  const w = setup();
  try {
    w.users.push({ _id: hex(7), role: "superadmin", name: "Boss" });
    await call(postController.getFeed, { query: {}, as: hex(7), role: "superadmin", universityId: null });
    const used = w.calls.postFind.find((f) => f && f.communityId === null);
    assert.equal(used.$and, undefined);
  } finally { w.restore(); }
});

test("a profile's posts are limited to the audience the viewer belongs to", async () => {
  const w = setup();
  try {
    const r = await call(postController.getPostsByUser, { params: { userId: FAR } });
    assert.equal(r.status, 200, "another university's profile can be opened");
    const used = w.calls.postFind.find((f) => f && f.userId === FAR);
    assert.ok(used && Array.isArray(used.$and), "and only the posts meant for this viewer are listed");
  } finally { w.restore(); }
});

test("reshare: a followers-only or hand-picked post cannot be reshared, and a post I cannot see is not found", async () => {
  const w = setup({ follows: [{ followerId: ME, followingId: FAR }] });
  try {
    const picked = await call(postController.resharePost, { params: { id: P_PEOPLE } });
    assert.equal(picked.status, 403);
    const followersOnly = await call(postController.resharePost, { params: { id: P_FOLLOWERS } });
    assert.equal(followersOnly.status, 403);
  } finally { w.restore(); }
  const w2 = setup();
  try {
    assert.equal((await call(postController.resharePost, { params: { id: P_FOLLOWERS } })).status, 404);
  } finally { w2.restore(); }
});

test("creating a post: a bad audience is refused before anything is uploaded", async () => {
  const w = setup();
  try {
    for (const body of [{ content: "hi", audience: "the-moon" }, { content: "hi", audience: "universities" }, { content: "hi", audience: "people", audienceUserIds: "[]" }]) {
      const r = await call(postController.createPost, { body });
      assert.equal(r.status, 400);
    }
  } finally { w.restore(); }
});

test("the older comment routes obey the post's audience too", async () => {
  const w = setup();
  try {
    assert.equal((await call(communityController.getCommentsForPost, { params: { postId: P_EVERYONE } })).status, 200);
    assert.equal((await call(communityController.getCommentsForPost, { params: { postId: P_FOLLOWERS } })).status, 404);
    assert.equal((await call(communityController.addComment, { params: { postId: P_FOLLOWERS }, body: { content: "hi" } })).status, 404);
    assert.equal(w.calls.commentCreated, 0);
  } finally { w.restore(); }
});

// ---------------------------------------------------------------- paging, audience editing, delete cleanup
const idOf = (n) => hex(900 + n);
const feedRows = (n) => Array.from({ length: n }, (_, i) => ({ _id: idOf(n - i), userId: AUTHOR, universityId: U1, communityId: null, content: "p" + i, media: [], createdAt: new Date(10000 - i * 1000) }));

test("feed paging: a full page says there is more and gives the marker; the last page says there is not", async () => {
  const w = setup();
  try {
    Post.find = (f) => { w.calls.postFind.push(f); return chain(feedRows(3)); };
    const r = await call(postController.getFeed, { query: { limit: "2" } });
    assert.equal(r.status, 200);
    assert.equal(r.body.data.length, 2);
    assert.equal(r.body.hasMore, true);
    assert.equal(r.body.nextCursor, `${new Date(9000).getTime()}_${idOf(2)}`);
    Post.find = () => chain(feedRows(2));
    const last = await call(postController.getFeed, { query: { limit: "2" } });
    assert.equal(last.body.hasMore, false);
    assert.equal(last.body.nextCursor, null);
  } finally { w.restore(); }
});

test("feed paging: the marker becomes an 'older than' condition, and a broken marker is a 400", async () => {
  const w = setup();
  try {
    await call(postController.getFeed, { query: { before: `5000_${idOf(5)}` } });
    const used = w.calls.postFind.find((f) => f && f.communityId === null);
    const older = used.$and.find((c) => c.$or && c.$or[0] && c.$or[0].createdAt && c.$or[0].createdAt.$lt);
    assert.ok(older, "the feed asked only for older posts");
    assert.equal(older.$or[0].createdAt.$lt.getTime(), 5000);
    const bad = await call(postController.getFeed, { query: { before: "nonsense" } });
    assert.equal(bad.status, 400);
  } finally { w.restore(); }
});

test("feed paging: with no limit it still returns up to 50, as before", async () => {
  const w = setup();
  try {
    let asked = 0;
    Post.find = () => { const o = chain([]); o.limit = (n) => { asked = n; return o; }; return o; };
    await call(postController.getFeed, { query: {} });
    assert.equal(asked, 51, "50 plus the one extra row that shows whether there is a next page");
  } finally { w.restore(); }
});

function audienceWorld(post) {
  const w = setup();
  const doc = { ...post, saved: 0, save: async function save() { this.saved += 1; } };
  Post.findById = () => chain(doc);
  Post.find = () => chain([]);
  Post.deleteMany = async () => ({ deletedCount: 0 });
  return { w, doc };
}

test("changing a post's audience: only the author, only an ordinary post, only a valid choice", async () => {
  const { w, doc } = audienceWorld({ _id: P_OWN, userId: ME, universityId: U1, communityId: null, reshareOf: null, audience: "university", audienceUniversityIds: [], audienceUserIds: [] });
  try {
    const ok = await call(postController.updatePostAudience, { params: { id: P_OWN }, body: { audience: "everyone" } });
    assert.equal(ok.status, 200);
    assert.equal(doc.audience, "everyone");
    assert.equal(doc.saved, 1);
    assert.equal(ok.body.data.audience, "everyone");
    const bad = await call(postController.updatePostAudience, { params: { id: P_OWN }, body: { audience: "universities" } });
    assert.equal(bad.status, 400);
    assert.equal(doc.saved, 1, "nothing was saved for a bad choice");
    const stranger = await call(postController.updatePostAudience, { params: { id: P_OWN }, body: { audience: "everyone" }, as: FAR });
    assert.equal(stranger.status, 403);
    const badId = await call(postController.updatePostAudience, { params: { id: "x" }, body: { audience: "everyone" } });
    assert.equal(badId.status, 400);
  } finally { w.restore(); }
});

test("changing the audience of a community post or a reshare is refused", async () => {
  const club = audienceWorld({ _id: P_OWN, userId: ME, communityId: CLUB, audience: "university" });
  try {
    assert.equal((await call(postController.updatePostAudience, { params: { id: P_OWN }, body: { audience: "everyone" } })).status, 400);
  } finally { club.w.restore(); }
  const reshare = audienceWorld({ _id: P_OWN, userId: ME, communityId: null, reshareOf: P_FAR, audience: "university" });
  try {
    assert.equal((await call(postController.updatePostAudience, { params: { id: P_OWN }, body: { audience: "everyone" } })).status, 400);
  } finally { reshare.w.restore(); }
});

test("narrowing the audience reports how many reshares were removed", async () => {
  const { w } = audienceWorld({ _id: P_OWN, userId: ME, universityId: U1, communityId: null, reshareOf: null, audience: "everyone", audienceUniversityIds: [], audienceUserIds: [] });
  try {
    Post.find = () => chain([{ _id: hex(70) }, { _id: hex(71) }]);
    let deleted = null;
    Post.deleteMany = async (f) => { deleted = f; return { deletedCount: 2 }; };
    const r = await call(postController.updatePostAudience, { params: { id: P_OWN }, body: { audience: "followers" } });
    assert.equal(r.status, 200);
    assert.equal(r.body.removedReshares, 2);
    assert.ok(deleted._id.$in.length === 2);
  } finally { w.restore(); }
});

test("deleting a post also clears what hangs off it", async () => {
  const w = setup();
  const log = [];
  const stash = [Comment.deleteMany, Like.deleteMany, HiddenPost.deleteMany, UserNotification.deleteMany, Post.deleteMany];
  try {
    const doc = { _id: P_OWN, userId: ME, media: [], deleteOne: async () => log.push("post") };
    Post.findById = () => chain(doc);
    Post.find = () => chain([{ _id: hex(80) }]);
    Comment.deleteMany = async () => { log.push("comments"); return {}; };
    Like.deleteMany = async () => { log.push("likes"); return {}; };
    HiddenPost.deleteMany = async () => { log.push("hidden"); return {}; };
    UserNotification.deleteMany = async () => { log.push("notifications"); return {}; };
    Post.deleteMany = async () => { log.push("reshares"); return {}; };
    const r = await call(postController.deletePost, { params: { id: P_OWN } });
    assert.equal(r.status, 200);
    assert.deepEqual(log, ["post", "comments", "likes", "hidden", "notifications", "reshares"]);
    const stranger = await call(postController.deletePost, { params: { id: P_OWN }, as: FAR });
    assert.equal(stranger.status, 403);
  } finally {
    [Comment.deleteMany, Like.deleteMany, HiddenPost.deleteMany, UserNotification.deleteMany, Post.deleteMany] = stash;
    w.restore();
  }
});
