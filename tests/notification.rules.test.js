"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { CATEGORIES, normalizeCategory, typeFilter, categoryOf, countsByCategory, extractMentions, snippet } = require("../src/utils/notification.rules");

test("the five tabs", () => {
  assert.deepEqual(CATEGORIES, ["all", "followers", "activity", "mentions", "updates"]);
});

test("an unknown or missing category means all", () => {
  for (const v of [undefined, null, "", "nonsense", "ALL ", "$ne"]) assert.equal(normalizeCategory(v), "all", String(v));
  assert.equal(normalizeCategory(" Followers "), "followers");
});

test("every tab filter keeps message notifications out", () => {
  assert.deepEqual(typeFilter("all"), { $nin: ["new_message"] });
  for (const c of ["followers", "activity", "mentions", "updates"]) {
    assert.ok(!typeFilter(c).$in.includes("new_message"), c);
  }
});

test("types land in the right tab, and messages in none", () => {
  assert.equal(categoryOf("new_follower"), "followers");
  assert.equal(categoryOf("post_like"), "activity");
  assert.equal(categoryOf("post_comment"), "activity");
  assert.equal(categoryOf("mention"), "mentions");
  assert.equal(categoryOf("grade_posted"), "updates");
  assert.equal(categoryOf("exam_published"), "updates");
  assert.equal(categoryOf("some_future_type"), "updates");
  assert.equal(categoryOf("new_message"), null);
});

test("unread counts per tab leave messages out of every count, including All", () => {
  const counts = countsByCategory([
    { _id: "new_follower", n: 2 }, { _id: "post_like", n: 3 }, { _id: "post_comment", n: 1 },
    { _id: "mention", n: 4 }, { _id: "grade_posted", n: 5 }, { _id: "new_message", n: 9 },
  ]);
  assert.deepEqual(counts, { all: 15, followers: 2, activity: 4, mentions: 4, updates: 5 });
  assert.deepEqual(countsByCategory([]), { all: 0, followers: 0, activity: 0, mentions: 0, updates: 0 });
  assert.deepEqual(countsByCategory(undefined), { all: 0, followers: 0, activity: 0, mentions: 0, updates: 0 });
});

test("mentions: names are found, lowercased and not repeated", () => {
  assert.deepEqual(extractMentions("Hi @Amina and @brian_k, also @amina again"), ["amina", "brian_k"]);
  assert.deepEqual(extractMentions("@first_one at the start"), ["first_one"]);
});

test("mentions: punctuation after a name is not part of it", () => {
  assert.deepEqual(extractMentions("thanks @amina."), ["amina"]);
  assert.deepEqual(extractMentions("(@amina), @bryan!"), ["amina", "bryan"]);
  assert.deepEqual(extractMentions("is that you @a.b.c?"), ["a.b.c"]);
});

test("mentions: emails, too-short names and stray @ are not mentions", () => {
  assert.deepEqual(extractMentions("write to me@gmail.com"), []);
  assert.deepEqual(extractMentions("@ab is too short"), []);
  assert.deepEqual(extractMentions("just an @ sign"), []);
  assert.deepEqual(extractMentions(""), []);
  assert.deepEqual(extractMentions(undefined), []);
  assert.deepEqual(extractMentions("@@double"), []);
});

test("mentions: one post cannot mention more than ten people", () => {
  const text = Array.from({ length: 25 }, (_, i) => `@user_${String(i).padStart(2, "0")}`).join(" ");
  assert.equal(extractMentions(text).length, 10);
});

test("snippet shortens long text and tidies whitespace", () => {
  assert.equal(snippet("  hello \n  world "), "hello world");
  assert.equal(snippet("x".repeat(100)), "x".repeat(80) + "...");
  assert.equal(snippet(undefined), "");
});
