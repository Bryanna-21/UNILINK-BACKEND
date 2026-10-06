const test = require("node:test");
const assert = require("node:assert/strict");
const rules = require("../src/utils/username.rules");
const { createLimiter } = require("../src/services/people.core");

test("usernames are normalised: trimmed, @ stripped, lowercased", () => {
  assert.equal(rules.validate("  @Bryanna_21 ").value, "bryanna_21");
});

test("length limits: 3 to 20", () => {
  assert.equal(rules.validate("ab").ok, false);
  assert.equal(rules.validate("abc").ok, true);
  assert.equal(rules.validate("a".repeat(20)).ok, true);
  assert.equal(rules.validate("a".repeat(21)).ok, false);
});

test("only letters, digits, dot and underscore; must start alphanumeric", () => {
  for (const bad of ["no spaces", "emoji😀name", "dash-name", "_leading", ".leading", "semi;colon", "a$b"]) {
    assert.equal(rules.validate(bad).ok, false, bad);
  }
  for (const good of ["john.doe", "john_doe", "j0hn", "123456"]) {
    assert.equal(rules.validate(good).ok, true, good);
  }
});

test("no double dots and no trailing dot", () => {
  assert.equal(rules.validate("a..b").ok, false);
  assert.equal(rules.validate("abc.").ok, false);
});

test("reserved and official-looking names are refused", () => {
  for (const r of ["admin", "Admin", "unilink", "support", "moderator", "root", "admin1", "unilink_2", "staff.01", "official"]) {
    assert.equal(rules.validate(r).ok, false, r);
  }
  assert.equal(rules.validate("supportive").ok, true, "a longer ordinary word is not reserved");
  assert.equal(rules.validate("administrate").ok, true);
});

test("non-string input never throws", () => {
  for (const v of [undefined, null, 42, {}, []]) assert.equal(rules.validate(v).ok, false);
});

test("searchTerm: min 3, only username characters, and 'adm' is searchable even though 'admin' is reserved", () => {
  assert.equal(rules.searchTerm("ab").ok, false);
  assert.equal(rules.searchTerm("adm").value, "adm");
  assert.equal(rules.searchTerm("@Bry").value, "bry");
  assert.equal(rules.searchTerm("a.*").ok, false, "regex metacharacters never reach the query");
  assert.equal(rules.searchTerm("x".repeat(21)).ok, false);
});

test("escapeRegex neutralises metacharacters", () => {
  assert.equal(rules.escapeRegex("a.b"), "a\\.b");
  assert.equal(new RegExp("^" + rules.escapeRegex("a.b")).test("axb"), false);
});

test("baseFrom: diacritics, empty names, email fallback, short names", () => {
  assert.equal(rules.baseFrom("Zoë Wanjiru", "x@y.com"), "zoe_wanjiru");
  assert.equal(rules.baseFrom("", "kamau.j@uni.ac.ke"), "kamau_j");
  assert.equal(rules.baseFrom("", ""), "student");
  assert.equal(rules.baseFrom("Jo", "j@x.com"), "jo1");
  assert.ok(rules.baseFrom("A Very Long Name Indeed Here", "").length <= 20);
});

test("generateUsername: takes the clean base when free, adds digits when taken", async () => {
  const free = await rules.generateUsername({ name: "Bryanna Wanjiru", isTaken: async () => false });
  assert.equal(free, "bryanna_wanjiru");

  const taken = new Set(["bryanna_wanjiru"]);
  let n = 0;
  const seq = [0.1, 0.2, 0.3, 0.4, 0.5, 0.6];
  const next = await rules.generateUsername({
    name: "Bryanna Wanjiru",
    isTaken: async (u) => taken.has(u),
    random: () => seq[n++ % seq.length],
  });
  assert.notEqual(next, "bryanna_wanjiru");
  assert.ok(next.startsWith("bryanna_wanjiru".slice(0, 18)) || next.startsWith("bryanna_wanjir"));
  assert.equal(rules.validate(next).ok, true);
});

test("generateUsername: a reserved-looking name still yields a valid username", async () => {
  const u = await rules.generateUsername({ name: "Admin", isTaken: async () => false });
  assert.equal(rules.validate(u).ok, true);
  assert.notEqual(u, "admin");
});

test("generateUsername: survives a crowded namespace and falls back, never returns a taken name", async () => {
  const always = async (u) => !u.startsWith("user");
  const u = await rules.generateUsername({ name: "Crowded", isTaken: always });
  assert.ok(u.startsWith("user"));
  await assert.rejects(rules.generateUsername({ name: "Crowded", isTaken: async () => true }));
});

test("limiter: allows up to max in the window, then refuses, then recovers", () => {
  let t = 0;
  const allow = createLimiter({ max: 3, windowMs: 1000, now: () => t });
  assert.equal(allow("a"), true);
  assert.equal(allow("a"), true);
  assert.equal(allow("a"), true);
  assert.equal(allow("a"), false);
  assert.equal(allow("b"), true, "other users are unaffected");
  t = 1001;
  assert.equal(allow("a"), true, "window slides");
});
