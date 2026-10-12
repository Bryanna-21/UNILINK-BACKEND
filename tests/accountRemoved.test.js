const test = require("node:test");
const assert = require("node:assert/strict");
const { accountBlock } = require("../src/utils/moderation.rules");

test("a removed account is blocked with institutional wording, not a Community Standards accusation", () => {
  const block = accountBlock({ removedAt: new Date(), status: "active" });
  assert.equal(block.code, "ACCOUNT_REMOVED");
  assert.match(block.message, /removed/i);
  assert.doesNotMatch(block.message, /Community Standards/i);
  assert.notEqual(block.appealable, true);
});

test("removal does not disturb the existing account states", () => {
  assert.equal(accountBlock({ status: "active" }), null);
  assert.equal(accountBlock({ status: "terminated" }).code, "ACCOUNT_TERMINATED");
  assert.equal(accountBlock({ status: "suspended" }).code, "ACCOUNT_SUSPENDED");
  assert.equal(accountBlock({ deletedAt: new Date() }).code, "ACCOUNT_DELETED");
  assert.equal(accountBlock({ removedAt: null, status: "active" }), null);
});
