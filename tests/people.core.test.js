const test = require("node:test");
const assert = require("node:assert/strict");
const { createPeopleCore } = require("../src/services/people.core");

// In-memory stand-in for people.repo.js. It honours the same contract (active accounts only,
// university scoping, exclusions), so these tests exercise the decision layer. They do NOT
// prove the mongoose queries in people.repo.js; that needs a real database.
function makeRepo({ users, follows = [], blocks = [], courses = [] }) {
  const db = new Map(users.map((u) => [String(u._id), { ...u }]));
  const state = { follows: [...follows], blocks: [...blocks], calls: {} };
  const active = (u) => !u.deletedAt && !["suspended", "terminated"].includes(u.status);
  const list = () => [...db.values()];
  const repo = {
    state,
    db,
    async userById(id) { return db.get(String(id)) || null; },
    async userByUsername(name) { return list().find((u) => u.username === name) || null; },
    async claimUsername(id, name, changedAt) {
      if (list().some((u) => u.username === name && String(u._id) !== String(id))) return false;
      const u = db.get(String(id));
      u.username = name;
      if (changedAt) u.usernameChangedAt = changedAt;
      return true;
    },
    async releaseUsername(id) { delete db.get(String(id)).username; },
    async searchUsersByUsernamePrefix(args) {
      state.calls.search = args;
      return list()
        .filter((u) => u.username && u.username.startsWith(args.prefix) && active(u))
        .filter((u) => !args.excludeIds.includes(String(u._id)))
        .filter((u) => args.universityId === null || u.universityId === args.universityId)
        .slice(0, args.limit);
    },
    async usersByIds(ids) { return list().filter((u) => ids.includes(String(u._id)) && active(u)); },
    async recentUsers({ universityId, excludeIds, limit }) {
      state.calls.recent = { universityId, excludeIds, limit };
      return list()
        .filter((u) => active(u) && u.universityId === universityId && u.username && !excludeIds.includes(String(u._id)))
        .sort((a, b) => b.createdAt - a.createdAt)
        .slice(0, limit);
    },
    async followedAmong(userId, ids) {
      return new Set(state.follows.filter((f) => f.followerId === String(userId) && ids.includes(f.followingId)).map((f) => f.followingId));
    },
    async followingIds(userId) { return state.follows.filter((f) => f.followerId === String(userId)).map((f) => f.followingId); },
    async followingOfMany(ids) { return state.follows.filter((f) => ids.includes(f.followerId)); },
    async coursesOf(userId) { return courses.filter((c) => c.enrolledStudentIds.includes(String(userId))); },
    async blockedIdsFor(userId) {
      const me = String(userId);
      return state.blocks.filter((b) => b.blockerId === me || b.blockedId === me).map((b) => (b.blockerId === me ? b.blockedId : b.blockerId));
    },
    async isBlockedEitherWay(a, b) {
      return state.blocks.some((x) => (x.blockerId === a && x.blockedId === b) || (x.blockerId === b && x.blockedId === a));
    },
    async addBlock(blockerId, blockedId) {
      if (!state.blocks.some((x) => x.blockerId === blockerId && x.blockedId === blockedId)) state.blocks.push({ blockerId, blockedId });
    },
    async removeBlock(blockerId, blockedId) {
      state.blocks = state.blocks.filter((x) => !(x.blockerId === blockerId && x.blockedId === blockedId));
    },
    async listBlocks(blockerId) { return state.blocks.filter((b) => b.blockerId === blockerId); },
    async removeFollowsBetween(a, b) {
      state.follows = state.follows.filter(
        (f) => !((f.followerId === a && f.followingId === b) || (f.followerId === b && f.followingId === a))
      );
    },
  };
  return repo;
}

const U = (id, username, extra = {}) => ({
  _id: id, name: `Name ${id}`, username, role: "student", universityId: "uniA", avatarUrl: null,
  createdAt: new Date(2026, 0, Number(id.replace(/\D/g, "")) || 1), ...extra,
});

const baseUsers = () => [
  U("u1", "bryanna"),
  U("u2", "kamau"),
  U("u3", "kamau2"),
  U("u4", "kamal"),
  U("u5", "karen"),
  U("u6", "kaya", { universityId: "uniB" }),
  U("u7", "kdeleted", { deletedAt: new Date() }),
  U("u8", "ksuspended", { status: "suspended" }),
  U("u9", "boss", { role: "superadmin", universityId: "uniB" }),
];

const make = (seed = {}, opts = {}) => {
  const repo = makeRepo({ users: baseUsers(), ...seed });
  let t = new Date("2026-10-05T10:00:00Z");
  const core = createPeopleCore({ repo, now: () => t, random: () => 0.5, ...opts });
  return { repo, core, advance: (ms) => { t = new Date(t.getTime() + ms); }, now: () => t };
};

// ---- search ----------------------------------------------------------------
test("search: fewer than 3 characters never reaches the database", async () => {
  const { core, repo } = make();
  const r = await core.search("u1", "ka");
  assert.deepEqual(r, { ok: true, data: [] });
  assert.equal(repo.state.calls.search, undefined);
});

test("search: a student only sees their own university", async () => {
  const { core, repo } = make();
  const r = await core.search("u1", "ka");
  assert.equal(r.data.length, 0);
  const r2 = await core.search("u1", "kam");
  assert.deepEqual(r2.data.map((x) => x.username), ["kamal", "kamau", "kamau2"], "no exact match, so alphabetical");
  assert.equal(repo.state.calls.search.universityId, "uniA");
  const kay = await core.search("u1", "kay");
  assert.equal(kay.data.length, 0, "kaya is at another university and must be invisible");
});

test("search: a superadmin searches across universities", async () => {
  const { core, repo } = make();
  const r = await core.search("u9", "kay");
  assert.deepEqual(r.data.map((x) => x.username), ["kaya"]);
  assert.equal(repo.state.calls.search.universityId, null);
});

test("search: deleted and suspended accounts are not returned", async () => {
  const { core } = make();
  assert.equal((await core.search("u1", "kdel")).data.length, 0);
  assert.equal((await core.search("u1", "ksus")).data.length, 0);
});

test("search: exact match first, then alphabetical; result carries no private fields", async () => {
  const { core } = make();
  const r = await core.search("u1", "kamau");
  assert.equal(r.data[0].username, "kamau");
  assert.equal(r.data[1].username, "kamau2");
  assert.deepEqual(Object.keys(r.data[0]).sort(), ["_id", "avatarUrl", "isFollowing", "name", "role", "username"]);
});

test("search: never returns yourself, and hides people you blocked or who blocked you", async () => {
  const { core, repo } = make({
    blocks: [{ blockerId: "u1", blockedId: "u2" }, { blockerId: "u4", blockedId: "u1" }],
  });
  const r = await core.search("u1", "ka");
  const mine = await core.search("u1", "bry");
  assert.equal(mine.data.length, 0, "own account excluded");
  const kam = await core.search("u1", "kam");
  assert.deepEqual(kam.data.map((x) => x.username), ["kamau2"]);
  assert.ok(repo.state.calls.search.excludeIds.includes("u2"));
  assert.ok(repo.state.calls.search.excludeIds.includes("u4"));
  assert.ok(repo.state.calls.search.excludeIds.includes("u1"));
  assert.equal(r.ok, true);
});

test("search: marks who you already follow", async () => {
  const { core } = make({ follows: [{ followerId: "u1", followingId: "u2" }] });
  const r = await core.search("u1", "kamau");
  assert.equal(r.data.find((x) => x.username === "kamau").isFollowing, true);
  assert.equal(r.data.find((x) => x.username === "kamau2").isFollowing, false);
});

test("search: rate limited per user, and other users are unaffected", async () => {
  const { core } = make({}, { config: { searchPerMinute: 3 } });
  for (let i = 0; i < 3; i += 1) assert.equal((await core.search("u1", "kamau")).ok, true);
  const refused = await core.search("u1", "kamau");
  assert.equal(refused.ok, false);
  assert.equal(refused.status, 429);
  assert.equal((await core.search("u2", "kamau")).ok, true);
});

test("search: a user with no university sees nobody; an unknown viewer is refused", async () => {
  const { core } = make({ users: [...baseUsers(), U("u20", "lonely", { universityId: undefined })] });
  assert.deepEqual((await core.search("u20", "kam")).data, []);
  const nobody = await core.search("ghost", "kam");
  assert.equal(nobody.status, 401);
});

// ---- username availability and change --------------------------------------
test("checkUsername: invalid, free, taken, own, and held-by-a-deleted-account", async () => {
  const { core } = make();
  assert.equal((await core.checkUsername("u1", "a")).data.available, false);
  assert.equal((await core.checkUsername("u1", "admin")).data.available, false);
  assert.equal((await core.checkUsername("u1", "brand_new")).data.available, true);
  assert.equal((await core.checkUsername("u1", "kamau")).data.available, false);
  assert.deepEqual((await core.checkUsername("u1", "BRYANNA")).data, { available: true, own: true });
  assert.equal((await core.checkUsername("u1", "kdeleted")).data.available, true);
});

test("changeUsername: the first change is free and is stamped", async () => {
  const { core, repo } = make();
  const r = await core.changeUsername("u1", "Bry.Codes");
  assert.deepEqual(r.data, { username: "bry.codes" });
  assert.equal(repo.db.get("u1").username, "bry.codes");
  assert.ok(repo.db.get("u1").usernameChangedAt);
});

test("changeUsername: a second change inside the cooldown is refused with a date, then allowed after it", async () => {
  const { core, advance } = make();
  await core.changeUsername("u1", "first_name");
  advance(3 * 86400000);
  const early = await core.changeUsername("u1", "second_name");
  assert.equal(early.ok, false);
  assert.match(early.message, /again on 2026-10-19/);
  advance(12 * 86400000);
  assert.equal((await core.changeUsername("u1", "second_name")).ok, true);
});

test("changeUsername: choosing your current username is a harmless no-op that does not restart the cooldown", async () => {
  const { core, repo } = make();
  const r = await core.changeUsername("u1", "bryanna");
  assert.equal(r.ok, true);
  assert.equal(repo.db.get("u1").usernameChangedAt, undefined);
});

test("changeUsername: taken is 409, invalid is 400, unknown viewer is 401", async () => {
  const { core } = make();
  assert.equal((await core.changeUsername("u1", "kamau")).status, 409);
  assert.equal((await core.changeUsername("u1", "no spaces")).status, 400);
  assert.equal((await core.changeUsername("ghost", "fine_name")).status, 401);
});

test("changeUsername: a name held by a deleted account is released and claimed", async () => {
  const { core, repo } = make();
  const r = await core.changeUsername("u1", "kdeleted");
  assert.equal(r.ok, true);
  assert.equal(repo.db.get("u7").username, undefined);
  assert.equal(repo.db.get("u1").username, "kdeleted");
});

test("changeUsername: an account with no username yet can claim one without any cooldown", async () => {
  const { core, repo } = make({ users: [...baseUsers(), U("u21", undefined)] });
  const r = await core.changeUsername("u21", "fresh_start");
  assert.equal(r.ok, true);
  assert.equal(repo.db.get("u21").username, "fresh_start");
});

// ---- signup ----------------------------------------------------------------
test("signup: a typed username must be valid and free", async () => {
  const { core } = make();
  assert.equal((await core.resolveSignupUsername({ requested: "no spaces", name: "X", email: "x@y.z" })).ok, false);
  const taken = await core.resolveSignupUsername({ requested: "Kamau", name: "X", email: "x@y.z" });
  assert.equal(taken.ok, false);
  assert.match(taken.message, /taken/);
  const good = await core.resolveSignupUsername({ requested: "@New_Kid", name: "X", email: "x@y.z" });
  assert.deepEqual(good, { ok: true, fields: { username: "new_kid" } });
});

test("signup: a typed username held by a deleted account is released for the new user", async () => {
  const { core, repo } = make();
  const r = await core.resolveSignupUsername({ requested: "kdeleted", name: "X", email: "x@y.z" });
  assert.equal(r.ok, true);
  assert.equal(repo.db.get("u7").username, undefined);
});

test("signup: with no username given, one is generated from the name and avoids taken ones", async () => {
  const { core } = make({ users: [...baseUsers(), U("u30", "grace_njeri")] });
  const r = await core.resolveSignupUsername({ name: "Grace Njeri", email: "g@x.com" });
  assert.equal(r.ok, true);
  assert.notEqual(r.fields.username, "grace_njeri");
  assert.ok(r.fields.username.startsWith("grace_njeri".slice(0, 18)));
  const fresh = await core.resolveSignupUsername({ requested: "  ", name: "Wanjiru Kim", email: "w@x.com" });
  assert.equal(fresh.fields.username, "wanjiru_kim");
});

test("signup: a failure while generating never blocks registration", async () => {
  const { core, repo } = make();
  repo.userByUsername = async () => { throw new Error("db down"); };
  const r = await core.resolveSignupUsername({ name: "Anyone", email: "a@x.com" });
  assert.deepEqual(r, { ok: true, fields: {} });
});

// ---- blocking --------------------------------------------------------------
test("block: you can't block yourself or a user that doesn't exist or is deleted", async () => {
  const { core } = make();
  assert.equal((await core.block("u1", "u1")).status, 400);
  assert.equal((await core.block("u1", "nobody")).status, 404);
  assert.equal((await core.block("u1", "u7")).status, 404);
});

test("block: records the block and removes follows in BOTH directions", async () => {
  const { core, repo } = make({
    follows: [
      { followerId: "u1", followingId: "u2" },
      { followerId: "u2", followingId: "u1" },
      { followerId: "u1", followingId: "u3" },
    ],
  });
  assert.deepEqual((await core.block("u1", "u2")).data, { blocked: true });
  assert.deepEqual(repo.state.follows, [{ followerId: "u1", followingId: "u3" }]);
  assert.equal(await core.eitherBlocked("u1", "u2"), true);
  assert.equal(await core.eitherBlocked("u2", "u1"), true, "symmetric for the gate");
  assert.equal(await core.eitherBlocked("u1", "u3"), false);
});

test("block: blocking twice creates one block; unblock is idempotent; the list shows who you blocked", async () => {
  const { core, repo } = make();
  await core.block("u1", "u2");
  await core.block("u1", "u2");
  assert.equal(repo.state.blocks.length, 1);
  const list = await core.listBlocks("u1");
  assert.deepEqual(list.data.map((u) => u.username), ["kamau"]);
  assert.deepEqual((await core.listBlocks("u2")).data, [], "the blocked person cannot see who blocked them");
  await core.unblock("u1", "u2");
  await core.unblock("u1", "u2");
  assert.equal(await core.eitherBlocked("u1", "u2"), false);
});

test("block: rate limited", async () => {
  const { core } = make({}, { config: { blockPerMinute: 2 } });
  await core.block("u1", "u2");
  await core.block("u1", "u3");
  assert.equal((await core.block("u1", "u4")).status, 429);
});

// ---- suggestions -----------------------------------------------------------
const crowd = () => {
  const users = [U("u1", "bryanna")];
  for (let i = 2; i <= 30; i += 1) users.push(U(`u${i}`, `person${i}`));
  users.push(U("u40", "faraway", { universityId: "uniB" }));
  return users;
};

test("suggest: classmates outrank friends-of-friends; reasons say why", async () => {
  const { core } = make({
    users: crowd(),
    courses: [{ enrolledStudentIds: ["u1", "u2", "u3"] }, { enrolledStudentIds: ["u1", "u2"] }],
    follows: [
      { followerId: "u1", followingId: "u10" },
      { followerId: "u10", followingId: "u4" },
      { followerId: "u10", followingId: "u5" },
    ],
  }, { config: { paddingThreshold: 0 } });
  const r = await core.suggest("u1");
  assert.deepEqual(r.data.map((x) => x.username).slice(0, 4), ["person2", "person3", "person4", "person5"]);
  assert.equal(r.data[0].reason, "In your course");
  assert.equal(r.data[2].reason, "Followed by someone you follow");
});

test("suggest: never suggests yourself, people you follow, blocked people, or other universities", async () => {
  const { core } = make({
    users: crowd(),
    courses: [{ enrolledStudentIds: ["u1", "u2", "u3", "u4", "u5", "u40"] }],
    follows: [{ followerId: "u1", followingId: "u2" }],
    blocks: [{ blockerId: "u3", blockedId: "u1" }],
  }, { config: { paddingThreshold: 0 } });
  const names = (await core.suggest("u1")).data.map((x) => x.username);
  assert.ok(!names.includes("bryanna"));
  assert.ok(!names.includes("person2"), "already followed");
  assert.ok(!names.includes("person3"), "blocked you");
  assert.ok(!names.includes("faraway"), "other university");
  assert.deepEqual(names, ["person4", "person5"]);
});

test("suggest: a brand-new account is padded with the newest people at the same university, newest first", async () => {
  const { core, repo } = make({ users: crowd() });
  const r = await core.suggest("u1");
  assert.equal(r.data.length, 15);
  assert.equal(r.data[0].username, "person30");
  assert.ok(r.data.every((x) => x.reason === "New at your university"));
  assert.ok(!r.data.some((x) => x.username === "faraway" || x.username === "bryanna"));
  assert.equal(repo.state.calls.recent.universityId, "uniA");
});

test("suggest: padding never repeats someone already suggested, and is skipped once there are enough", async () => {
  const enrolled = ["u1", ...Array.from({ length: 12 }, (_, i) => `u${i + 2}`)];
  const { core, repo } = make({ users: crowd(), courses: [{ enrolledStudentIds: enrolled }] });
  const r = await core.suggest("u1");
  assert.equal(r.data.length, 12 > 8 ? 12 : 15);
  assert.equal(repo.state.calls.recent, undefined, "12 classmates is above the threshold, so no padding");

  const few = make({ users: crowd(), courses: [{ enrolledStudentIds: ["u1", "u2", "u3"] }] });
  const r2 = await few.core.suggest("u1");
  const ids = r2.data.map((x) => x._id);
  assert.equal(new Set(ids).size, ids.length, "no duplicates");
  assert.deepEqual(ids.slice(0, 2).sort(), ["u2", "u3"]);
});

test("suggest: no university means no suggestions; unknown viewer is refused", async () => {
  const { core } = make({ users: [...crowd(), U("u50", "nouni", { universityId: undefined })] });
  assert.deepEqual((await core.suggest("u50")).data, []);
  assert.equal((await core.suggest("ghost")).status, 401);
});
