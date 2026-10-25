"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { PLACEHOLDERS, resolveContent, normalizeSource, reviewStatus } = require("../src/utils/legalContent.rules");

const doc = { title: "T {{OPERATOR_NAME}}", sections: [{ blocks: [{ p: "Mail {{CONTACT_EMAIL}} or {{CONTACT_EMAIL}}" }, { ul: ["a {{ODPC_REGISTRATION}}", "plain"] }] }], n: 3, flag: true };

test("a missing detail is shown as an obvious marker and listed, never invented", () => {
  const r = resolveContent(doc, {});
  assert.match(r.content.title, /\[Owner to provide: legal name of the operator/);
  assert.equal(r.complete, false);
  assert.deepEqual(r.openItems.map((i) => i.key).sort(), ["CONTACT_EMAIL", "ODPC_REGISTRATION", "OPERATOR_NAME"]);
  assert.equal(r.openItems.find((i) => i.key === "CONTACT_EMAIL").env, "LEGAL_CONTACT_EMAIL");
});
test("supplied details are filled in everywhere they appear, and the result is complete", () => {
  const r = resolveContent(doc, { LEGAL_OPERATOR_NAME: "Acme Ltd", LEGAL_CONTACT_EMAIL: "privacy@acme.example", LEGAL_ODPC_REGISTRATION: "REG-1" });
  assert.equal(r.content.title, "T Acme Ltd");
  assert.equal(r.content.sections[0].blocks[0].p, "Mail privacy@acme.example or privacy@acme.example");
  assert.equal(r.content.sections[0].blocks[1].ul[0], "a REG-1");
  assert.equal(r.complete, true);
  assert.deepEqual(r.openItems, []);
});
test("blank or whitespace values count as missing", () => {
  assert.equal(resolveContent({ x: "{{CONTACT_EMAIL}}" }, { LEGAL_CONTACT_EMAIL: "   " }).complete, false);
});
test("non-text values pass through and the original is not mutated", () => {
  const before = JSON.stringify(doc);
  const r = resolveContent(doc, {});
  assert.equal(r.content.n, 3);
  assert.equal(r.content.flag, true);
  assert.equal(JSON.stringify(doc), before);
});
test("an unknown token is left visible so a typo is noticed", () => {
  const r = resolveContent({ x: "{{NOT_A_THING}}" }, {});
  assert.equal(r.content.x, "{{NOT_A_THING}}");
});
test("every registered placeholder names a distinct LEGAL_ environment variable", () => {
  const envs = Object.values(PLACEHOLDERS).map((p) => p.env);
  assert.equal(new Set(envs).size, envs.length);
  assert.ok(envs.every((e) => /^LEGAL_[A-Z_]+$/.test(e)));
});
test("source is normalised to a known value", () => {
  assert.equal(normalizeSource("WEB"), "web");
  assert.equal(normalizeSource("mobile"), "mobile");
  for (const v of ["ios", "", null, undefined, {}, "<script>"]) assert.equal(normalizeSource(v), "unknown", String(v));
});
test("a notice is a draft unless the owner says it has been reviewed", () => {
  assert.equal(reviewStatus({}), "draft");
  assert.equal(reviewStatus({ LEGAL_REVIEW_STATUS: "yes" }), "draft");
  assert.equal(reviewStatus({ LEGAL_REVIEW_STATUS: "Reviewed" }), "reviewed");
});
