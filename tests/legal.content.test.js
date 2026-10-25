"use strict";
// Ties the Privacy Notice to the code. If one of these fails, either the code changed and the notice must be updated
// (and its version bumped), or the notice made a claim the code does not support. Do not "fix" the test to make it pass.
const test = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs");
const path = require("node:path");
const notice = require("../src/content/privacyNotice");
const { PLACEHOLDERS } = require("../src/utils/legalContent.rules");

const root = path.join(__dirname, "..");
const read = (p) => fs.readFileSync(path.join(root, p), "utf8");
const pkg = JSON.parse(read("package.json"));
const deps = { ...pkg.dependencies, ...pkg.devDependencies };

const allText = (n) => n.sections.flatMap((s) => s.blocks.flatMap((b) => (b.p ? [b.p] : b.ul))).join("\n");
const sectionText = (id) => notice.sections.find((s) => s.id === id).blocks.flatMap((b) => (b.p ? [b.p] : b.ul)).join("\n");
const text = allText(notice);

// ── shape ──
test("version and date are well formed, sections are numbered in order with unique ids", () => {
  assert.match(notice.version, /^\d+\.\d+$/);
  assert.match(notice.effectiveDate, /^\d{4}-\d{2}-\d{2}$/);
  assert.deepEqual(notice.sections.map((s) => s.number), notice.sections.map((_, i) => i + 1));
  assert.equal(new Set(notice.sections.map((s) => s.id)).size, notice.sections.length);
  for (const s of notice.sections) for (const b of s.blocks) assert.ok(typeof b.p === "string" || (Array.isArray(b.ul) && b.ul.length), s.id);
});
test("every {{PLACEHOLDER}} used is registered, so none can reach a reader as a raw token", () => {
  for (const m of text.matchAll(/\{\{([A-Z_]+)\}\}/g)) assert.ok(PLACEHOLDERS[m[1]], `unregistered placeholder ${m[1]}`);
});
test("the notice covers what Kenya's Data Protection Act (s.29, duty to notify) expects it to say", () => {
  const ids = notice.sections.map((s) => s.id);
  for (const needed of ["who", "collect", "why", "sharing", "processors", "transfers", "retention", "deletion", "rights", "age", "security", "changes", "contact"]) assert.ok(ids.includes(needed), needed);
  assert.match(sectionText("who"), /CONTACT_EMAIL/);
  assert.match(sectionText("rights"), /Office of the Data Protection Commissioner/);
  assert.match(sectionText("rights"), /odpc\.go\.ke/);
  assert.match(sectionText("changes"), /not the same as agreeing/, "acknowledgement is kept distinct from consent");
});
test("it never claims to be reviewed, certified or compliant", () => {
  assert.doesNotMatch(text, /lawyer[- ]approved|certified|fully compliant|guarantee|100%/i);
});

// ── providers: the notice must name every processor the code really uses ──
test("every service the code sends personal data to is named in the notice", () => {
  const checks = [
    ["Cloudinary", !!deps.cloudinary],
    ["Twilio", !!deps.twilio],
    ["Brevo", /require\("sib-api-v3-sdk"\)/.test(read("src/utils/otp.util.js"))],
    ["Expo", /exp\.host|expo/i.test(read("src/utils/push.util.js"))],
    ["Gemini", /GEMINI_API_KEY/.test(read("src/controllers/ai.controller.js"))],
  ];
  for (const [name, inUse] of checks) {
    assert.ok(inUse, `${name} is no longer used by the code: remove it from the notice`);
    assert.match(sectionText("processors"), new RegExp(name), `${name} is used by the code but missing from the notice`);
  }
});
test("the claim of no third-party analytics holds: no analytics or tracking SDK is a dependency", () => {
  const banned = /sentry|mixpanel|amplitude|segment|firebase|google-analytics|gtag|posthog|hotjar|bugsnag|datadog|newrelic|appsflyer|adjust|facebook/i;
  assert.deepEqual(Object.keys(deps).filter((d) => banned.test(d)), [], "update the notice (and bump the version) before adding one of these");
  assert.match(sectionText("collect"), /does not currently use third-party analytics/);
});
test("the AI assistant description matches the code: last 10 messages, each shortened to 2,000 characters", () => {
  const ai = read("src/controllers/ai.controller.js");
  assert.match(ai, /slice\(-10\)/);
  assert.match(ai, /slice\(0,\s*2000\)/);
  assert.match(sectionText("processors"), /last 10 messages/);
  assert.match(sectionText("processors"), /2,000 characters/);
});
test("the SMS description matches the code: it contains the student's name and location text, not coordinates", () => {
  const sms = read("src/utils/sms.util.js");
  assert.match(sms, /\$\{studentName\}/);
  assert.match(sms, /\$\{location\}/);
  assert.doesNotMatch(sms, /latitude|longitude|coordinates/);
  assert.match(sectionText("processors"), /your name and the location text/);
});

// ── account deletion: the notice must say what the code really erases and what it leaves ──
const del = (() => {
  const src = read("src/controllers/profile.controller.js");
  const start = src.indexOf("exports.deleteMyAccount");
  return src.slice(start, src.indexOf("exports.clearPushToken", start));
})();
const assigned = [...del.matchAll(/user\.(\w+)\s*=(?!=)/g)].map((m) => m[1]);

test("account deletion erases exactly the fields the notice lists", () => {
  const expected = ["name", "email", "password", "avatarUrl", "coverUrl", "bio", "phone", "admissionNumber", "trustedContacts", "pushToken", "twoFactorEnabled", "pendingPasswordHash", "pendingResetPasswordHash", "deletedAt", "tokenVersion"];
  assert.deepEqual([...new Set(assigned)].sort(), expected.slice().sort(), "deleteMyAccount changed: update the 'what is erased' text and bump the version");
  const erased = sectionText("deletion").split("What stays")[0];
  for (const word of ["Deleted User", "email address", "photo links", "bio", "phone number", "admission number", "trusted contacts", "push token", "signed out"]) assert.ok(erased.includes(word), word);
});
test("what deletion leaves behind is stated: username and academic details stay, uploaded files are not removed", () => {
  assert.ok(!assigned.includes("username"), "username is now erased on deletion: update the notice's 'what stays' text");
  for (const kept of ["universityId", "programme", "yearOfStudy", "semester", "courseId"]) assert.ok(!assigned.includes(kept), kept);
  assert.ok(!/cloudinary|destroy/i.test(del), "deletion now removes files: update the notice");
  const stays = sectionText("deletion").split("What stays")[1];
  assert.match(stays, /username/);
  assert.match(stays, /not automatically deleted/);
});
test("only the mobile app can delete an account today, and the notice says so", () => {
  assert.match(sectionText("deletion"), /website does not have this option yet/);
});
