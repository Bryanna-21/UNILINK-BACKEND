const test = require("node:test");
const assert = require("node:assert/strict");
const { cleanMessageText, clampLimit, MAX_LENGTH } = require("../src/utils/staffChat.rules");

test("messages are trimmed; empty, blank, non-string and oversize are rejected", () => {
  assert.equal(cleanMessageText("  hello  "), "hello");
  assert.equal(cleanMessageText("a\r\nb"), "a\nb");
  for (const bad of ["", "   ", null, undefined, 42, {}, "x".repeat(MAX_LENGTH + 1)]) {
    assert.equal(cleanMessageText(bad), null, String(bad));
  }
  assert.equal(cleanMessageText("x".repeat(MAX_LENGTH)).length, MAX_LENGTH);
});

test("limit is clamped to 1..100 with a default of 50", () => {
  assert.equal(clampLimit(undefined), 50);
  assert.equal(clampLimit("abc"), 50);
  assert.equal(clampLimit("0"), 1);
  assert.equal(clampLimit("-5"), 1);
  assert.equal(clampLimit("500"), 100);
  assert.equal(clampLimit("20"), 20);
});
