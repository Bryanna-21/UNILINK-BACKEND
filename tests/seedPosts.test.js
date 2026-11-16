"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { CHANNELS } = require("../scripts/data/seedPosts.data");
const { buildSeedPlan, validatePlan, DAY } = require("../src/utils/seedPosts.rules");
const { planSeed, applySeed, removeSeed } = require("../src/services/seedPosts.service");

const NOW = new Date("2026-11-14T12:00:00Z");
const plan = () => buildSeedPlan({ channels: CHANNELS, now: NOW });

test("the plan is exactly 200 posts from 10 accounts, 20 each, and passes every check", () => {
  const p = plan();
  assert.equal(p.accounts.length, 10);
  assert.equal(p.posts.length, 200);
  for (const a of p.accounts) assert.equal(p.posts.filter((x) => x.channelKey === a.key).length, 20, a.key);
  assert.deepEqual(validatePlan(p), []);
});

test("the same input always gives the same plan, so a re-run changes nothing", () => {
  assert.deepEqual(plan(), plan());
});

test("posts are spread over the last 30 days, never in the future, never all at once", () => {
  const p = plan();
  const times = p.posts.map((x) => x.createdAt.getTime());
  assert.ok(Math.max(...times) < NOW.getTime());
  assert.ok(Math.min(...times) >= NOW.getTime() - 30 * DAY);
  assert.ok(Math.max(...times) - Math.min(...times) > 25 * DAY, "they cover most of the window");
  assert.ok(new Set(times).size > 190, "almost every post has its own time");
  assert.ok(times.every((t, i) => i === 0 || t >= times[i - 1]), "oldest first");
});

test("neighbouring posts come from different accounts", () => {
  const p = plan();
  let same = 0;
  for (let i = 1; i < p.posts.length; i += 1) if (p.posts[i].channelKey === p.posts[i - 1].channelKey) same += 1;
  assert.equal(same, 0);
});

test("the accounts are honest: every bio says it is a UniLink account, and the email can never receive mail", () => {
  for (const a of plan().accounts) {
    assert.match(a.bio, /UniLink/);
    assert.match(a.email, /@seed\.unilink\.invalid$/);
  }
});

test("the data makes no claims of personal experience, prices or guaranteed results", () => {
  const text = CHANNELS.flatMap((c) => c.posts.map((p) => `${p[0]} ${p[1]}`)).join("\n");
  assert.doesNotMatch(text, /\b(KSh|Ksh|KES)\b|\bI (got|made|earned|passed)\b|\bmy (lecturer|friend) told\b/i);
  // The one mention of guaranteed returns is a warning about quick-money schemes, not a promise.
  const mentions = CHANNELS.flatMap((c) => c.posts).filter((x) => /guarantee/i.test(x[1]));
  assert.ok(mentions.every((x) => /walk away|never guarantee/i.test(x[1])));
});

test("validation catches duplicates, bad usernames, long text and missing UniLink labels", () => {
  const p = plan();
  const bad = JSON.parse(JSON.stringify(p));
  bad.posts.forEach((x) => { x.createdAt = new Date(x.createdAt); });
  bad.posts[1].content = bad.posts[0].content;
  bad.posts[2].content = "x".repeat(400);
  bad.posts[3].title = "";
  bad.accounts[0].username = "Bad Name!";
  bad.accounts[1].bio = "just a bio";
  const found = validatePlan(bad).join("\n");
  assert.match(found, /duplicate text/);
  assert.match(found, /text must be/);
  assert.match(found, /title must be/);
  assert.match(found, /Bad Name!/);
  assert.match(found, /must say it is a UniLink account/);
});

// ---- the service, against tiny fake collections -------------------------------------------------------------
function coll(rows = []) {
  let n = 0;
  const c = { rows };
  const match = (r, f) => Object.entries(f).every(([k, v]) => {
    if (k === "$or") return v.some((x) => match(r, x));
    if (v && typeof v === "object" && "$in" in v) return v.$in.map(String).includes(String(r[k]));
    return String(r[k]) === String(v);
  });
  c.find = (f = {}) => { const out = c.rows.filter((r) => match(r, f)); const o = { select: () => o, lean: async () => out }; return o; };
  c.create = async (d) => { const r = { _id: `id${++n}`, ...d }; c.rows.push(r); return r; };
  c.insertMany = async (docs) => { docs.forEach((d) => c.rows.push({ _id: `id${++n}`, ...d })); return docs; };
  c.deleteMany = async (f) => { const gone = c.rows.filter((r) => match(r, f)); c.rows = c.rows.filter((r) => !match(r, f)); return { deletedCount: gone.length }; };
  return c;
}
const models = () => ({ User: coll(), Post: coll(), Comment: coll(), Like: coll(), HiddenPost: coll(), UserNotification: coll(), Follow: coll(), hashPassword: async (p) => `hash(${p.length})` });

test("apply creates the accounts and 200 posts, all flagged, all for everyone, with dates", async () => {
  const m = models();
  const out = await applySeed(m, plan(), { universityId: "uniA" });
  assert.deepEqual(out, { accountsCreated: 10, postsCreated: 200 });
  assert.equal(m.User.rows.length, 10);
  assert.ok(m.User.rows.every((u) => u.isSeed === true && u.role === "student" && u.universityId === "uniA"));
  assert.ok(m.User.rows.every((u) => u.password.startsWith("hash(") && u.password !== "hash(0)"), "an unguessable password, never a fixed one");
  assert.equal(m.Post.rows.length, 200);
  assert.ok(m.Post.rows.every((p) => p.isSeed && p.audience === "everyone" && p.seedKey && p.createdAt instanceof Date && p.media.length === 0));
  const owners = new Set(m.Post.rows.map((p) => p.userId));
  assert.equal(owners.size, 10, "each post belongs to one of the ten accounts");
});

test("running it twice creates nothing new", async () => {
  const m = models();
  await applySeed(m, plan(), {});
  const again = await applySeed(m, plan(), {});
  assert.deepEqual(again, { accountsCreated: 0, postsCreated: 0 });
  assert.equal(m.Post.rows.length, 200);
  assert.equal(m.User.rows.length, 10);
});

test("a half-finished earlier run is completed, not duplicated", async () => {
  const m = models();
  await applySeed(m, plan(), {});
  m.Post.rows.splice(0, 50);
  const out = await applySeed(m, plan(), {});
  assert.equal(out.postsCreated, 50);
  assert.equal(m.Post.rows.length, 200);
});

test("a username that belongs to a real account stops everything and writes nothing", async () => {
  const m = models();
  m.User.rows.push({ _id: "real1", username: "unilink_study", isSeed: false });
  await assert.rejects(applySeed(m, plan(), {}), /already belong to real accounts: unilink_study/);
  assert.equal(m.Post.rows.length, 0);
  assert.equal(m.User.rows.length, 1);
});

test("the dry-run plan reports what would be created without writing", async () => {
  const m = models();
  const todo = await planSeed(m, plan());
  assert.equal(todo.accountsToCreate.length, 10);
  assert.equal(todo.postsToCreate.length, 200);
  assert.equal(m.Post.rows.length, 0);
});

test("remove deletes every seeded account and post and what hangs off them, and leaves real data alone", async () => {
  const m = models();
  await applySeed(m, plan(), {});
  const seededPost = m.Post.rows[0];
  const seedUser = m.User.rows[0];
  m.User.rows.push({ _id: "real", username: "amina", isSeed: false });
  m.Post.rows.push({ _id: "realpost", userId: "real", content: "mine" });
  m.Comment.rows.push({ _id: "c1", postId: String(seededPost._id) }, { _id: "c2", postId: "realpost" });
  m.Like.rows.push({ _id: "l1", postId: String(seededPost._id) }, { _id: "l2", postId: "realpost" });
  m.Follow.rows.push({ _id: "f1", followerId: "real", followingId: String(seedUser._id) }, { _id: "f2", followerId: "real", followingId: "someoneelse" });
  m.Post.rows.push({ _id: "rs", reshareOf: String(seededPost._id), userId: "real" });
  const out = await removeSeed(m);
  assert.equal(out.posts, 200);
  assert.equal(out.accounts, 10);
  assert.deepEqual(m.User.rows.map((u) => u._id), ["real"]);
  assert.deepEqual(m.Post.rows.map((p) => p._id), ["realpost"], "a reshare of a seed post goes with it");
  assert.deepEqual(m.Comment.rows.map((c) => c._id), ["c2"]);
  assert.deepEqual(m.Like.rows.map((l) => l._id), ["l2"]);
  assert.deepEqual(m.Follow.rows.map((f) => f._id), ["f2"]);
});
