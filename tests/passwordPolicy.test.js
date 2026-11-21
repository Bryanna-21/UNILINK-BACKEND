"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { checkPassword, MIN, MAX } = require("../src/utils/passwordPolicy");

const ok = (pw, ctx) => assert.equal(checkPassword(pw, ctx).ok, true, `${pw} should be accepted`);
const no = (pw, ctx, pattern) => {
  const r = checkPassword(pw, ctx);
  assert.equal(r.ok, false, `${pw} should be refused`);
  if (pattern) assert.match(r.message, pattern);
};

test("the minimum is 8 characters and the old minimum of 6 is no longer enough", () => {
  assert.equal(MIN, 8);
  no("Ab1!xy", {}, /at least 8/);
  no("Ab1!xyz", {}, /at least 8/);
  ok("Tr4vel!ng-Zebra");
});

test("an absurdly long password is refused, a long one is fine", () => {
  no("a1".repeat(70), {}, /too long/);
  ok("correct horse battery staple 42");
  assert.equal(MAX, 128);
});

test("very common passwords are refused, including the usual decorations", () => {
  for (const pw of ["password", "Password1", "PASSWORD123", "password123!", "qwerty123", "Welcome2026", "letmein99", "iloveyou1", "Unilink2026", "unilink123", "Admin@123", "godisgood1"]) no(pw, {}, /common|easy|predictable/);
});

test("only digits is refused, whatever the length, including phone numbers", () => {
  for (const pw of ["12345678", "0712345678", "20260101", "123456789012"]) no(pw, {}, /numbers|pattern|simple/);
});

test("one repeated character and keyboard or counting runs are refused", () => {
  no("aaaaaaaa", {}, /simple/);
  no("11111111", {}, /simple|numbers/);
  no("abcdefgh", {}, /pattern|common/);
  no("qwertyui", {}, /pattern|common/);
  no("zyxwvuts", {}, /pattern/);
  no("asdfghjkl", {}, /pattern|common/);
});

test("a password built from the person's email or name is refused", () => {
  no("amina.wanjiru2026!", { email: "amina.wanjiru@uni.ac.ke" }, /email/);
  no("MyWanjiru#77", { name: "Amina Wanjiru" }, /name/);
  ok("Amina-is-unrelated-77", { email: "bo@x.co", name: "Bo Li" }, undefined);
  ok("Zebra-Quartz-81", { email: "amina.wanjiru@uni.ac.ke", name: "Amina Wanjiru" });
});

test("ordinary good passwords of mixed kinds are accepted", () => {
  for (const pw of ["Blue-Giraffe-1987", "mango_tree_sunrise", "7Rivers&Hills", "S3cure!Campus#Life"]) ok(pw);
});

test("non-text is refused", () => {
  for (const pw of [undefined, null, 12345678, { $ne: "" }, ["Abcdefg1!"]]) assert.equal(checkPassword(pw).ok, false);
});

test("the message always says what to do", () => {
  for (const pw of ["short", "password1", "12345678", "aaaaaaaa"]) assert.ok(checkPassword(pw).message.length > 20);
});
