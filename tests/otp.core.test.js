"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const crypto = require("node:crypto");
const { makeOtpCore, MAX_ATTEMPTS } = require("../src/services/otp.core");

const U1 = "64b0000000000000000000a1";
const U2 = "64b0000000000000000000a2";

// A fake OtpCode model that understands what the core asks of it.
function fakeModel() {
  const rows = [];
  let n = 0;
  const matches = (r, f) => Object.entries(f).every(([k, v]) => {
    if (v && typeof v === "object" && "$gt" in v) return new Date(r[k]) > v.$gt;
    return r[k] === v;
  });
  const wrap = (r) => Object.assign(r, { save: async () => r });
  return {
    rows,
    async updateMany(f, u) { rows.filter((r) => matches(r, f)).forEach((r) => Object.assign(r, u.$set)); },
    async create(d) { const r = wrap({ _id: `o${++n}`, used: false, createdAt: new Date(Date.now() + n), ...d }); rows.push(r); return r; },
    findOne(f) {
      const found = rows.filter((r) => matches(r, f)).sort((a, b) => b.createdAt - a.createdAt)[0] || null;
      return { sort: async () => found };
    },
  };
}
const make = (extra = {}) => { const Model = fakeModel(); const core = makeOtpCore({ OtpCode: Model, secret: () => "test-secret", ...extra }); return { Model, core }; };

test("a new code is six digits, and the database holds a hash, never the digits", async () => {
  const { Model, core } = make();
  const code = await core.createOtp(U1, "login_2fa");
  assert.match(code, /^\d{6}$/);
  const stored = Model.rows[0].code;
  assert.notEqual(stored, code);
  assert.match(stored, /^[a-f0-9]{64}$/);
  assert.equal(Model.rows[0].attempts, 0);
});

test("the right code works once and cannot be replayed", async () => {
  const { core } = make();
  const code = await core.createOtp(U1, "login_2fa");
  assert.equal(await core.verifyOtp(U1, "login_2fa", code), true);
  assert.equal(await core.verifyOtp(U1, "login_2fa", code), false);
});

test("a code is only good for its own person and its own purpose", async () => {
  const { core } = make();
  const code = await core.createOtp(U1, "login_2fa");
  assert.equal(await core.verifyOtp(U2, "login_2fa", code), false);
  assert.equal(await core.verifyOtp(U1, "password_reset", code), false);
  assert.equal(await core.verifyOtp(U1, "login_2fa", code), true);
});

test("five wrong guesses burn the code, so even the right one is then refused", async () => {
  const { core } = make();
  const code = await core.createOtp(U1, "password_reset");
  const wrong = code === "000000" ? "111111" : "000000";
  for (let i = 0; i < MAX_ATTEMPTS; i += 1) assert.equal(await core.verifyOtp(U1, "password_reset", wrong), false);
  assert.equal(await core.verifyOtp(U1, "password_reset", code), false, "burned");
});

test("four wrong guesses do not burn it", async () => {
  const { core } = make();
  const code = await core.createOtp(U1, "password_reset");
  const wrong = code === "000000" ? "111111" : "000000";
  for (let i = 0; i < MAX_ATTEMPTS - 1; i += 1) await core.verifyOtp(U1, "password_reset", wrong);
  assert.equal(await core.verifyOtp(U1, "password_reset", code), true);
});

test("asking for a new code replaces the old one", async () => {
  const { core } = make();
  const first = await core.createOtp(U1, "verify_signup");
  const second = await core.createOtp(U1, "verify_signup");
  if (first !== second) assert.equal(await core.verifyOtp(U1, "verify_signup", first), false);
  assert.equal(await core.verifyOtp(U1, "verify_signup", second), true);
});

test("an expired code is refused", async () => {
  let now = new Date("2026-11-14T10:00:00Z");
  const { core } = make({ now: () => now });
  const code = await core.createOtp(U1, "login_2fa");
  now = new Date("2026-11-14T10:11:00Z");
  assert.equal(await core.verifyOtp(U1, "login_2fa", code), false);
});

test("a code made before hashing existed (plain digits) is still accepted until it expires, with the same limits", async () => {
  const { Model, core } = make();
  await Model.create({ userId: U1, code: "482913", purpose: "login_2fa", expiresAt: new Date(Date.now() + 600000), attempts: 0 });
  assert.equal(await core.verifyOtp(U1, "login_2fa", "000000"), false);
  assert.equal(Model.rows[0].attempts, 1);
  assert.equal(await core.verifyOtp(U1, "login_2fa", "482913"), true);
});

test("THE ATTACK: an operator object in place of the user id or the code can never match anything", async () => {
  const { Model, core } = make();
  const mine = await core.createOtp(U2, "verify_signup");
  const queried = [];
  const original = Model.findOne.bind(Model);
  Model.findOne = (f) => { queried.push(f); return original(f); };
  for (const [uid, code] of [[{ $ne: null }, mine], [{ $gt: "" }, mine], [U2, { $ne: "" }], [[U2], mine], [null, mine], [U2, 123456], [U2, ["123456"]], [U2, "12345"], [U2, "1234567"], ["not-an-id", mine]]) {
    assert.equal(await core.verifyOtp(uid, "verify_signup", code), false, JSON.stringify([uid, code]));
  }
  assert.equal(queried.length, 0, "none of them reached the database");
  assert.equal(await core.verifyOtp(U2, "verify_signup", mine), true, "the real owner with the real code still works");
});

test("creating a code for something that is not a user id is an error, not an update of everybody's codes", async () => {
  const { Model, core } = make();
  await core.createOtp(U1, "verify_signup");
  await assert.rejects(core.createOtp({ $ne: null }, "verify_signup"), /user id as text/);
  assert.equal(Model.rows.filter((r) => r.used).length, 0);
});

test("the stored hash depends on the person, the purpose and the secret", () => {
  const a = makeOtpCore({ OtpCode: fakeModel(), secret: () => "s1" });
  const b = makeOtpCore({ OtpCode: fakeModel(), secret: () => "s2" });
  assert.notEqual(a.hashCode("123456", U1, "login_2fa"), a.hashCode("123456", U2, "login_2fa"));
  assert.notEqual(a.hashCode("123456", U1, "login_2fa"), a.hashCode("123456", U1, "password_reset"));
  assert.notEqual(a.hashCode("123456", U1, "login_2fa"), b.hashCode("123456", U1, "login_2fa"));
  assert.equal(a.hashCode("123456", U1, "login_2fa"), crypto.createHmac("sha256", "s1").update(`${U1}|login_2fa|123456`).digest("hex"));
});
