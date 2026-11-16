"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { encodeCursor, decodeCursor, parseLimit, olderThan, DEFAULT_LIMIT, MAX_LIMIT } = require("../src/utils/feedCursor");

const id = (n) => String(n).padStart(24, "a").slice(-24);

test("a cursor round-trips: the time and the id of the last post", () => {
  const post = { _id: id(7), createdAt: new Date("2026-11-14T10:00:00.123Z") };
  const c = encodeCursor(post);
  assert.match(c, /^\d+_[a-f0-9]{24}$/);
  const back = decodeCursor(c);
  assert.equal(back.createdAt.toISOString(), "2026-11-14T10:00:00.123Z");
  assert.equal(back.id, id(7));
});

test("no cursor means the first page; a broken one is an error, not silently the first page", () => {
  assert.equal(decodeCursor(undefined), null);
  assert.equal(decodeCursor(""), null);
  for (const bad of ["abc", "123_xyz", "123", "_" + id(1), "1_" + id(1) + "x", "9999999999999999_" + id(1), { $ne: 1 }, ["a"]]) {
    assert.ok(decodeCursor(bad).error, `should reject ${JSON.stringify(bad)}`);
  }
});

test("a post that cannot be turned into a cursor gives none", () => {
  assert.equal(encodeCursor({ _id: "nope", createdAt: new Date() }), null);
  assert.equal(encodeCursor({ _id: id(1), createdAt: "not a date" }), null);
});

test("the limit defaults to 50, is never below 1 and never above 50", () => {
  assert.equal(parseLimit(undefined), DEFAULT_LIMIT);
  assert.equal(parseLimit("abc"), DEFAULT_LIMIT);
  assert.equal(parseLimit("0"), DEFAULT_LIMIT);
  assert.equal(parseLimit("-5"), DEFAULT_LIMIT);
  assert.equal(parseLimit("20"), 20);
  assert.equal(parseLimit("500"), MAX_LIMIT);
  assert.equal(parseLimit("12.9"), 12);
});

test("'older than' takes everything before the time, and same-millisecond posts with a smaller id", () => {
  const cursor = decodeCursor(`1000_${id(5)}`);
  const cond = olderThan(cursor);
  assert.deepEqual(cond.$or[0], { createdAt: { $lt: new Date(1000) } });
  assert.deepEqual(cond.$or[1], { createdAt: new Date(1000), _id: { $lt: id(5) } });
  assert.equal(olderThan(cursor, (x) => `ID(${x})`).$or[1]._id.$lt, `ID(${id(5)})`);
});

test("paging through a list with ties never skips or repeats a post", () => {
  // 7 posts, several in the same millisecond, newest first.
  const posts = [[3000, 9], [3000, 8], [2000, 7], [2000, 6], [2000, 5], [1000, 4], [1000, 3]]
    .map(([ms, n]) => ({ _id: id(n), createdAt: new Date(ms) }));
  const matches = (p, cond) => cond.$or.some((c) => (c.createdAt.$lt ? p.createdAt < c.createdAt.$lt : p.createdAt.getTime() === c.createdAt.getTime() && p._id < c._id.$lt));
  const seen = [];
  let cursor = null;
  for (let page = 0; page < 10; page += 1) {
    const pool = cursor ? posts.filter((p) => matches(p, olderThan(cursor))) : posts;
    const rows = pool.slice(0, 3);
    seen.push(...rows.map((r) => r._id));
    if (rows.length < 3) break;
    cursor = decodeCursor(encodeCursor(rows[rows.length - 1]));
  }
  assert.deepEqual(seen, posts.map((p) => p._id));
});
