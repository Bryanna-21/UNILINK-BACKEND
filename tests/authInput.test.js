"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { isObjectIdString, isOtpCode, cleanEmail, cleanText } = require("../src/utils/authInput");

test("an id is exactly 24 hex characters, as text, and nothing else", () => {
  assert.equal(isObjectIdString("64b0000000000000000000a1"), true);
  for (const bad of [{ $ne: null }, { $gt: "" }, ["64b0000000000000000000a1"], 123, null, undefined, "", "xyz", "64b0000000000000000000a", "64b0000000000000000000a1x", "64b0000000000000000000g1"]) {
    assert.equal(isObjectIdString(bad), false, JSON.stringify(bad));
  }
});

test("a code is exactly six digits, as text", () => {
  assert.equal(isOtpCode("012345"), true);
  for (const bad of [123456, { $ne: "" }, ["123456"], "12345", "1234567", "12345a", " 12345", "", null]) assert.equal(isOtpCode(bad), false, JSON.stringify(bad));
});

test("an email is text, trimmed and lower-cased; objects and nonsense give null", () => {
  assert.equal(cleanEmail("  Amina@Uni.AC.KE "), "amina@uni.ac.ke");
  for (const bad of [{ $ne: null }, ["a@b.co"], 5, "", "a@b", "no at sign.com", "a b@c.de", "a".repeat(250) + "@x.com"]) assert.equal(cleanEmail(bad), null, JSON.stringify(bad));
});

test("cleanText keeps plain text within its length and refuses everything else", () => {
  assert.equal(cleanText("hello"), "hello");
  assert.equal(cleanText("", { min: 1 }), null);
  assert.equal(cleanText("x".repeat(201)), null);
  assert.equal(cleanText({ $ne: 1 }), null);
});
