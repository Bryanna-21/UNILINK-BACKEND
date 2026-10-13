const test = require("node:test");
const assert = require("node:assert/strict");
const { cleanHttpsUrl, parseDeadline, isActive, parseOpportunity } = require("../src/utils/opportunities.rules");

const NOW = new Date("2026-10-15T09:00:00Z");
const good = { type: "loan", title: "HELB top-up", provider: "HELB", description: "Loan for continuing students." };

test("only plain https links are accepted", () => {
  assert.equal(cleanHttpsUrl(" https://example.com/apply "), "https://example.com/apply");
  for (const bad of ["http://example.com", "javascript:alert(1)", "intent://x#Intent;end", "https://user:pw@example.com", "example.com", "https://a b.com", "", null, 5, "https://" + "a".repeat(600) + ".com"]) {
    assert.equal(cleanHttpsUrl(bad), null, String(bad));
  }
});

test("deadlines must be real calendar dates", () => {
  assert.equal(parseDeadline("2026-12-31").toISOString(), "2026-12-31T23:59:59.999Z");
  for (const bad of ["2026-02-30", "2026-13-01", "12/31/2026", "2026-1-5", "", null, 20261231, "2026-12-31T00:00:00Z"]) {
    assert.equal(parseDeadline(bad), null, String(bad));
  }
});

test("a listing stays active through its deadline day and expires after", () => {
  assert.equal(isActive(null, NOW), true);
  assert.equal(isActive(parseDeadline("2026-10-15"), NOW), true);
  assert.equal(isActive(parseDeadline("2026-10-14"), NOW), false);
});

test("a minimal listing is accepted and optional fields default to empty", () => {
  const r = parseOpportunity(good, NOW);
  assert.equal(r.ok, true);
  assert.deepEqual(r.value, { ...good, eligibility: "", amountText: "", link: "", deadline: null });
});

test("a full listing is accepted and trimmed", () => {
  const r = parseOpportunity({ ...good, type: "sponsorship", title: "  Mastercard  ", eligibility: "Top 10%", amountText: "KES 50,000", link: "https://example.org/x", deadline: "2026-11-30" }, NOW);
  assert.equal(r.ok, true);
  assert.equal(r.value.title, "Mastercard");
  assert.equal(r.value.deadline.toISOString(), "2026-11-30T23:59:59.999Z");
});

test("bad input is rejected with a reason", () => {
  assert.equal(parseOpportunity(null, NOW).ok, false);
  assert.equal(parseOpportunity({ ...good, type: "grant" }, NOW).ok, false);
  assert.equal(parseOpportunity({ ...good, title: "   " }, NOW).ok, false);
  assert.equal(parseOpportunity({ ...good, provider: "" }, NOW).ok, false);
  assert.equal(parseOpportunity({ ...good, description: "x".repeat(2001) }, NOW).ok, false);
  assert.equal(parseOpportunity({ ...good, link: "http://insecure.example" }, NOW).ok, false);
  assert.equal(parseOpportunity({ ...good, deadline: "2026-10-14" }, NOW).message, "The deadline has already passed.");
  assert.equal(parseOpportunity({ ...good, eligibility: "x".repeat(1001) }, NOW).ok, false);
  assert.equal(parseOpportunity({ ...good, amountText: "x".repeat(81) }, NOW).ok, false);
});

test("today's date is still a valid deadline", () => {
  assert.equal(parseOpportunity({ ...good, deadline: "2026-10-15" }, NOW).ok, true);
});
