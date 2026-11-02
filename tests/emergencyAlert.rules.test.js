"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { selectAlertAdmins, buildAdminAlert, buildPushMessages } = require("../src/utils/emergencyAlert.rules");

const U_A = "a".repeat(24), U_B = "b".repeat(24);
const people = [
  { _id: "1", role: "superadmin", universityId: null },
  { _id: "2", role: "admin", universityId: U_A },
  { _id: "3", role: "admin", universityId: U_B },
  { _id: "4", role: "admin", universityId: null },
  { _id: "5", role: "admin" },
  { _id: "6", role: "lecturer", universityId: U_A },
  { _id: "7", role: "student", universityId: U_A },
  null,
];
const ids = (list) => list.map((u) => u._id).sort();

test("a report from university A reaches the superadmin, platform admins and A's admin only", () => {
  assert.deepEqual(ids(selectAlertAdmins(people, U_A)), ["1", "2", "4", "5"]);
});

test("university B's admin never hears about university A, and the reverse", () => {
  assert.ok(!ids(selectAlertAdmins(people, U_A)).includes("3"));
  assert.ok(!ids(selectAlertAdmins(people, U_B)).includes("2"));
});

test("ids compare as text, so an ObjectId and a string match", () => {
  const oid = { toString: () => U_A };
  assert.deepEqual(ids(selectAlertAdmins([{ _id: "2", role: "admin", universityId: oid }], U_A)), ["2"]);
});

test("a report with no university reaches only the superadmin and platform admins", () => {
  assert.deepEqual(ids(selectAlertAdmins(people, null)), ["1", "4", "5"]);
  assert.deepEqual(ids(selectAlertAdmins(people, undefined)), ["1", "4", "5"]);
});

test("lecturers and students are never alerted, and bad input gives an empty list", () => {
  const out = ids(selectAlertAdmins(people, U_A));
  assert.ok(!out.includes("6") && !out.includes("7"));
  assert.deepEqual(selectAlertAdmins(null, U_A), []);
  assert.deepEqual(selectAlertAdmins(undefined, U_A), []);
});

test("an SOS alert names the student and the place and is marked as an SOS", () => {
  const a = buildAdminAlert({ type: "sos", isSOS: true, studentName: "Amina Otieno", location: "Library, 2nd floor", message: "", reportId: "r1" });
  assert.equal(a.title, "SOS ALERT");
  assert.match(a.body, /Amina Otieno needs help near Library, 2nd floor/);
  assert.deepEqual(a.data, { type: "emergency_alert", reportId: "r1", severity: "sos" });
  assert.equal(a.record.type, "sos_alert");
});

test("an SOS without a place or a name still reads correctly", () => {
  const a = buildAdminAlert({ type: "sos", isSOS: true, studentName: "", location: "", reportId: "r1" });
  assert.match(a.body, /^A student needs help\. Open to respond\.$/);
});

test("an abuse report never puts its text into a notification", () => {
  const a = buildAdminAlert({ type: "abuse", isSOS: false, studentName: "X", message: "private details here", reportId: "r2" });
  assert.ok(!a.body.includes("private details"));
  assert.ok(!a.record.message.includes("private details"));
  assert.equal(a.data.type, "emergency_report");
});

test("a normal report shows a clipped snippet of its text", () => {
  const long = "x".repeat(500);
  const a = buildAdminAlert({ type: "medical", isSOS: false, message: long, reportId: "r3" });
  assert.equal(a.body.length, 140);
  assert.equal(a.title, "New medical report");
  assert.equal(buildAdminAlert({ type: "safety", isSOS: false, message: "", reportId: "r4" }).body, "No additional details provided.");
});

test("loud pushes use the emergency channel with a long time-to-live, quiet ones the default channel", () => {
  const isExpoToken = (t) => typeof t === "string" && t.startsWith("ExponentPushToken[");
  const alert = { title: "t", body: "b", data: { type: "emergency_alert" } };
  const loud = buildPushMessages(["ExponentPushToken[a]", "ExponentPushToken[a]", null, "junk", "ExponentPushToken[b]"], alert, { loud: true, isExpoToken });
  assert.equal(loud.length, 2, "duplicates, nulls and junk are dropped");
  assert.ok(loud.every((m) => m.channelId === "emergency" && m.priority === "high" && m.ttl === 3600 && m.sound === "default"));
  const quiet = buildPushMessages(["ExponentPushToken[a]"], alert, { loud: false, isExpoToken });
  assert.equal(quiet[0].channelId, "default");
  assert.equal("ttl" in quiet[0], false);
  assert.deepEqual(buildPushMessages(undefined, alert, { loud: true, isExpoToken }), []);
});
