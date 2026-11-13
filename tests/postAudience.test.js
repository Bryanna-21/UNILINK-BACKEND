"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizeAudience, audienceAllows, audienceFilter, needsFollowFacts, isReshareable, MAX_UNIVERSITIES, MAX_PEOPLE } = require("../src/utils/postAudience");

const hex = (n) => String(n).padStart(24, "0");

test("no audience means the author's university, the same as every older post", () => {
  assert.deepEqual(normalizeAudience({}), { ok: true, value: { audience: "university", audienceUniversityIds: [], audienceUserIds: [] } });
  assert.equal(normalizeAudience({ audience: "" }).value.audience, "university");
  assert.equal(normalizeAudience().value.audience, "university");
});

test("each audience is accepted, in any case, and an unknown one is refused", () => {
  for (const a of ["everyone", "university", "followers", "friends"]) assert.equal(normalizeAudience({ audience: a.toUpperCase() }).value.audience, a);
  assert.equal(normalizeAudience({ audience: "the-whole-world" }).ok, false);
  assert.equal(normalizeAudience({ audience: 5 }).ok, false);
});

test("universities need at least one real id, and a list that came as text works", () => {
  assert.equal(normalizeAudience({ audience: "universities" }).ok, false);
  assert.equal(normalizeAudience({ audience: "universities", audienceUniversityIds: [] }).ok, false);
  assert.equal(normalizeAudience({ audience: "universities", audienceUniversityIds: ["nope"] }).ok, false);
  const json = normalizeAudience({ audience: "universities", audienceUniversityIds: JSON.stringify([hex(1), hex(2), hex(1)]) });
  assert.deepEqual(json.value.audienceUniversityIds, [hex(1), hex(2)], "duplicates dropped");
  const csv = normalizeAudience({ audience: "universities", audienceUniversityIds: `${hex(1)}, ${hex(2)}` });
  assert.deepEqual(csv.value.audienceUniversityIds, [hex(1), hex(2)]);
  const arr = normalizeAudience({ audience: "universities", audienceUniversityIds: [hex(3)] });
  assert.deepEqual(arr.value.audienceUniversityIds, [hex(3)]);
});

test("people need at least one real id; the lists are capped; other audiences carry no lists", () => {
  assert.equal(normalizeAudience({ audience: "people" }).ok, false);
  assert.equal(normalizeAudience({ audience: "people", audienceUserIds: "[broken" }).ok, false);
  assert.equal(normalizeAudience({ audience: "people", audienceUserIds: ["x"] }).ok, false);
  const many = Array.from({ length: MAX_PEOPLE + 1 }, (_, i) => hex(i + 1));
  assert.equal(normalizeAudience({ audience: "people", audienceUserIds: many }).ok, false);
  const manyUnis = Array.from({ length: MAX_UNIVERSITIES + 1 }, (_, i) => hex(i + 1));
  assert.equal(normalizeAudience({ audience: "universities", audienceUniversityIds: manyUnis }).ok, false);
  const stray = normalizeAudience({ audience: "everyone", audienceUserIds: [hex(1)], audienceUniversityIds: [hex(2)] });
  assert.deepEqual(stray.value, { audience: "everyone", audienceUniversityIds: [], audienceUserIds: [] });
});

test("only followers and friends posts need to know who follows whom", () => {
  assert.equal(needsFollowFacts({ audience: "followers" }), true);
  assert.equal(needsFollowFacts({ audience: "friends" }), true);
  for (const a of ["everyone", "university", "universities", "people", undefined]) assert.equal(needsFollowFacts({ audience: a }), false);
});

test("only posts for everyone, or for the author's university, can be reshared", () => {
  assert.equal(isReshareable({}), true);
  assert.equal(isReshareable({ audience: "everyone" }), true);
  assert.equal(isReshareable({ audience: "university" }), true);
  for (const a of ["universities", "followers", "friends", "people", "unknown"]) assert.equal(isReshareable({ audience: a }), false);
});

test("the database filter agrees with the per-post rule", () => {
  const viewer = { id: hex(1), universityId: hex(50) };
  const f = audienceFilter({ viewer, followingIds: [hex(2)], mutualIds: [hex(3)] });
  const has = (cond) => f.$or.some((b) => JSON.stringify(b) === JSON.stringify(cond));
  assert.ok(has({ userId: hex(1) }), "own posts");
  assert.ok(has({ audience: "everyone" }));
  assert.ok(has({ audience: "followers", userId: { $in: [hex(2)] } }));
  assert.ok(has({ audience: "friends", userId: { $in: [hex(3)] } }));
  assert.ok(has({ audience: "people", audienceUserIds: hex(1) }));
  assert.ok(has({ audience: { $in: [null, "university"] }, universityId: hex(50) }), "older posts have no audience field");
  assert.ok(has({ audience: "universities", audienceUniversityIds: hex(50) }));
});

test("a viewer with no university gets no university branches, so nothing is matched by accident", () => {
  const f = audienceFilter({ viewer: { id: hex(1), universityId: null } });
  assert.equal(f.$or.some((b) => b.universityId !== undefined || b.audienceUniversityIds !== undefined), false);
  assert.equal(f.$or.length, 5);
});

test("audienceAllows: every audience, including the closed default for an unknown one", () => {
  const viewer = { id: "v", universityId: "A" };
  const base = { universityId: "A" };
  assert.equal(audienceAllows({ post: base, viewer }), true);
  assert.equal(audienceAllows({ post: { ...base, universityId: "B" }, viewer }), false);
  assert.equal(audienceAllows({ post: { audience: "everyone" }, viewer: { id: "v" } }), true);
  assert.equal(audienceAllows({ post: { audience: "universities", audienceUniversityIds: ["A"] }, viewer }), true);
  assert.equal(audienceAllows({ post: { audience: "followers" }, viewer, follows: { viewerFollowsAuthor: true } }), true);
  assert.equal(audienceAllows({ post: { audience: "friends" }, viewer, follows: { viewerFollowsAuthor: true } }), false);
  assert.equal(audienceAllows({ post: { audience: "people", audienceUserIds: ["v"] }, viewer }), true);
  assert.equal(audienceAllows({ post: { audience: "nonsense" }, viewer }), false);
});
