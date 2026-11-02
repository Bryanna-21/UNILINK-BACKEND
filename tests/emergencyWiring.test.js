"use strict";
// Proves the new pieces are actually connected, not just present.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");

const read = (p) => fs.readFileSync(path.join(__dirname, "..", p), "utf8");

test("the ring routes are mounted BEFORE the old emergency routes", () => {
  const app = read("src/app.js");
  const ring = app.indexOf('require("./routes/emergencyRing.routes")');
  const old = app.indexOf('app.use("/api/emergency", emergencyRoutes)');
  assert.ok(ring > -1 && old > -1, "both mounts must exist");
  assert.ok(ring < old, "ring routes must come first, or the old /contacts wins");
});

test("reporting an emergency goes through the scoped alert service", () => {
  const src = read("src/controllers/emergency.controller.js");
  assert.match(src, /emergencyAlerts\.alertAdmins\(\{ report, isSOS \}\)/);
  assert.match(src, /require\("\.\.\/services\/emergencyAlert\.instance"\)/);
  const create = src.slice(src.indexOf("exports.reportEmergency"), src.indexOf("exports.getMyReports"));
  assert.ok(!/notifyAdmins\(/.test(create), "reportEmergency must no longer notify every admin everywhere");
});

test("the socket server gives every user a private room and the superadmin the admin room", () => {
  const src = read("src/socket.js");
  assert.match(src, /socket\.join\(`user:\$\{userId\}`\)/);
  assert.match(src, /role === "admin" \|\| socket\.user\.role === "superadmin"/);
  assert.match(src, /module\.exports = \{ initSocketServer, emitToAdmins, emitToUsers \}/);
  const { emitToUsers } = require("../src/socket");
  assert.equal(typeof emitToUsers, "function");
  assert.doesNotThrow(() => emitToUsers(["a"], "x", {}), "must be safe before the server starts");
  assert.doesNotThrow(() => emitToUsers(null, "x", {}));
});

test("hardened trusted-contact routes answer BEFORE the old profile routes", () => {
  const app = read("src/app.js");
  const mine = app.indexOf('require("./routes/trustedContacts.routes")');
  const old = app.indexOf('app.use("/api/profile", profileRoutes)');
  assert.ok(mine > -1 && old > -1 && mine < old);
});

test("the SOS text goes to normalised numbers, and the confirmation push never claims contacts were told unless an SMS was sent", () => {
  const src = read("src/controllers/emergency.controller.js");
  assert.match(src, /contacts: normalizeContactPhones\(reporter\.trustedContacts\)/);
  assert.match(src, /smsSent = smsResults\.filter\(\(r\) => r\.smsStatus === "sent"\)\.length/);
  assert.match(src, /smsSent > 0/);
  assert.ok(!/sent to campus security and your trusted contacts/.test(src));
});
