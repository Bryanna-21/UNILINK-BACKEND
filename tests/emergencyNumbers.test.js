"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { countryCode, numbersFor, readOverrides, BUILT_IN, FALLBACK, DEFAULT_COUNTRY } = require("../src/utils/emergencyNumbers");

const NO_OVERRIDES = { overrides: {} };

test("country names and codes in any case and spacing resolve to a code", () => {
  assert.equal(countryCode("Kenya"), "KE");
  assert.equal(countryCode("  kenya "), "KE");
  assert.equal(countryCode("ke"), "KE");
  assert.equal(countryCode("South Africa"), "ZA");
  assert.equal(countryCode("Atlantis"), null);
  assert.equal(countryCode(""), null);
  assert.equal(countryCode(undefined), null);
  assert.equal(countryCode(42), null);
});

test("Kenya has 999 and 112", () => {
  const r = numbersFor("Kenya", NO_OVERRIDES);
  assert.equal(r.country, "KE");
  assert.equal(r.known, true);
  assert.deepEqual(r.numbers.map((n) => n.phone), ["999", "112"]);
});

test("no country at all means Kenya, the home market", () => {
  for (const v of [undefined, null, "", "   "]) {
    const r = numbersFor(v, NO_OVERRIDES);
    assert.equal(r.country, DEFAULT_COUNTRY);
    assert.equal(r.known, true);
  }
});

test("a country that is named but not listed gets the 112 fallback and known:false", () => {
  const r = numbersFor("Atlantis", NO_OVERRIDES);
  assert.equal(r.known, false);
  assert.deepEqual(r.numbers, FALLBACK);
  const listedLater = numbersFor("FR", NO_OVERRIDES); // a valid code that is not in the table
  assert.equal(listedLater.known, false);
  assert.deepEqual(listedLater.numbers, FALLBACK);
});

test("every built-in number is dialable digits and every name is short", () => {
  for (const [code, list] of Object.entries(BUILT_IN)) {
    assert.match(code, /^[A-Z]{2}$/);
    assert.ok(list.length > 0);
    for (const e of list) {
      assert.match(e.phone, /^\+?\d{2,15}$/, `${code} ${e.name}`);
      assert.ok(e.name.length > 0 && e.name.length <= 40);
    }
  }
});

test("results are copies, so a caller cannot change the table", () => {
  const a = numbersFor("Kenya", NO_OVERRIDES);
  a.numbers[0].phone = "000";
  assert.equal(numbersFor("Kenya", NO_OVERRIDES).numbers[0].phone, "999");
  const f = numbersFor("Atlantis", NO_OVERRIDES);
  f.numbers[0].phone = "000";
  assert.equal(FALLBACK[0].phone, "112");
});

test("overrides replace a country and invalid entries are dropped", () => {
  const overrides = readOverrides(
    JSON.stringify({
      KE: [{ name: "Emergency services", phone: "999" }, { name: "Bad", phone: "call me" }, { name: "", phone: "112" }],
      Uganda: [{ name: "Police", phone: "999" }],
      Nowhere: [{ name: "X", phone: "1" }],
      TZ: "not a list",
    })
  );
  assert.deepEqual(Object.keys(overrides).sort(), ["KE", "UG"]);
  assert.deepEqual(overrides.KE, [{ name: "Emergency services", phone: "999" }]);
  assert.deepEqual(numbersFor("Kenya", { overrides }).numbers, [{ name: "Emergency services", phone: "999" }]);
  assert.deepEqual(numbersFor("UG", { overrides }).numbers, [{ name: "Police", phone: "999" }]);
});

test("unreadable overrides are ignored, never thrown", () => {
  for (const raw of [undefined, "", "{not json", "[]", "null", "42"]) {
    assert.deepEqual(readOverrides(raw), {});
  }
});
