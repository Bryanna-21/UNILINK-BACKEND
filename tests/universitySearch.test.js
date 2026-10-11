const test = require("node:test");
const assert = require("node:assert/strict");
const search = require("../src/utils/universitySearch");

test("normalizes university names consistently", () => {
  assert.equal(
    search.normalizeUniversityName("  UNÍVERSITY   OF NAIROBI  "),
    "university of nairobi"
  );
});

test("creates unique searchable name tokens", () => {
  assert.deepEqual(
    search.universitySearchTokens("University of Nairobi"),
    ["university", "of", "nairobi"]
  );
  assert.deepEqual(
    search.universitySearchTokens("Nairobi Nairobi University"),
    ["nairobi", "university"]
  );
  assert.deepEqual(search.universitySearchTokens("  "), []);
});

test("accepts useful search terms and rejects too-short or excessive input", () => {
  assert.deepEqual(search.universitySearchTerm("Na"), {
    ok: true,
    value: "na",
  });
  assert.equal(search.universitySearchTerm("N").ok, false);
  assert.equal(search.universitySearchTerm("x".repeat(101)).ok, false);
  assert.equal(search.universitySearchTerm(null).ok, false);
});

test("normalization prevents regex metacharacters from entering search terms", () => {
  const term = search.universitySearchTerm("Uni.*(Nairobi)");
  assert.equal(term.ok, true);
  assert.equal(term.value, "uni nairobi");
  assert.equal(search.escapeRegex("a.b"), "a\\.b");
  assert.equal(new RegExp("^" + search.escapeRegex("a.b")).test("axb"), false);
});

test("search filters support full-name and word-prefix matching", () => {
  const { buildUniversitySearchFilters } = require("../src/utils/universitySearch");
  const result = buildUniversitySearchFilters("Nairobi", "");

  assert.equal(result.ok, true);
  assert.deepEqual(result.fullNameFilter, {
    status: "active",
    nameSearch: { $regex: "^nairobi" },
  });
  assert.deepEqual(result.tokenFilter, {
    status: "active",
    nameSearchTokens: { $regex: "^nairobi" },
  });
});

test("search filters preserve the optional country restriction", () => {
  const { buildUniversitySearchFilters } = require("../src/utils/universitySearch");
  const result = buildUniversitySearchFilters("Kabarak", "Kenya");

  assert.equal(result.ok, true);
  assert.equal(result.fullNameFilter.country, "Kenya");
  assert.equal(result.tokenFilter.country, "Kenya");
});

test("search filters reject too-short and too-long terms", () => {
  const { buildUniversitySearchFilters } = require("../src/utils/universitySearch");

  assert.equal(buildUniversitySearchFilters("N", "").ok, false);
  assert.equal(buildUniversitySearchFilters("x".repeat(101), "").ok, false);
});
