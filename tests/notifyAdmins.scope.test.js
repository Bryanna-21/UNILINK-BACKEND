"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

// notifyAdmins and notifyUsers with the database, the live socket and Expo replaced, so this checks
// exactly who is told and how.
const state = { rows: [], emitted: [], pushed: [], inserted: [], sentTokens: [] };
const stub = (rel, exports) => {
  const file = require.resolve(rel);
  require.cache[file] = { id: file, filename: file, loaded: true, exports };
};
const admins = [
  { _id: "a1", role: "admin", universityId: "uniA", pushToken: "tA" },
  { _id: "a2", role: "admin", universityId: "uniB", pushToken: "tB" },
  { _id: "a3", role: "admin", pushToken: "tP" },
  { _id: "a4", role: "admin", universityId: "", pushToken: "tQ" },
];
const matches = (u, filter) => Object.entries(filter).every(([k, v]) => {
  if (k === "$or") return v.some((alt) => matches(u, alt));
  if (v && typeof v === "object" && "$exists" in v) return (u[k] !== undefined) === v.$exists;
  if (v && typeof v === "object" && "$in" in v) return v.$in.includes(String(u._id));
  if (v === null) return u[k] === null || u[k] === undefined;
  return u[k] === v;
});
stub("../src/models/User", { find: (f) => ({ select: () => ({ lean: async () => admins.filter((u) => matches(u, f)) , then: undefined }) }) });
stub("../src/models/Notification", { insertMany: async (rows) => { state.rows.push(...rows); } });
stub("../src/socket", { emitToAdmins: (e, p) => state.emitted.push({ to: "admins", e, p }), emitToUsers: (ids, e, p) => state.emitted.push({ to: ids, e, p }) });
stub("../src/utils/push.util", { sendPushNotification: (token, msg) => state.pushed.push({ token, msg }) });
const notifyAdmins = require("../src/middleware/notifyAdmins.middleware");

const reset = () => { state.rows = []; state.emitted = []; state.pushed = []; };

test("without a university, every admin is told, as before", async () => {
  reset();
  await notifyAdmins({ type: "new_emergency_report", title: "t", message: "m", link: "/reports" });
  assert.deepEqual(state.rows.map((r) => r.recipientId).sort(), ["a1", "a2", "a3", "a4"]);
  assert.equal(state.emitted[0].to, "admins");
  assert.equal(state.pushed.length, 4);
});

test("with a university, only that university's admins and platform admins are told", async () => {
  reset();
  await notifyAdmins({ type: "sos_alert", title: "t", message: "m", link: "/reports", universityId: "uniA" });
  assert.deepEqual(state.rows.map((r) => r.recipientId).sort(), ["a1", "a3", "a4"]);
  assert.deepEqual(state.emitted[0].to.sort(), ["a1", "a3", "a4"], "the live message is not broadcast to every admin");
  assert.equal(state.pushed.length, 3);
});

test("push:false keeps the panel list and live message but sends no phone push", async () => {
  reset();
  await notifyAdmins({ type: "sos_alert", title: "t", message: "m", link: "/reports", universityId: "uniA", push: false });
  assert.equal(state.rows.length, 3);
  assert.equal(state.emitted.length, 1);
  assert.equal(state.pushed.length, 0);
});
