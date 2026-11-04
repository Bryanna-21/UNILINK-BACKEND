"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createEmergencyAlerter } = require("../src/services/emergencyAlert.service");
const { normalizePhone, samePhone, phoneVariants } = require("../src/utils/phone.rules");
const { countryKey, validateNumbers, pickNumbers, cleanEntry } = require("../src/utils/emergencyNumbers.rules");
const { createNumbersService } = require("../src/services/emergencyNumbers.service");
const { createEmergencyNumbersController } = require("../src/controllers/emergencyNumbers.controller");
const { buildMessages } = require("../src/utils/pushBatch");

// ---------- phone numbers ----------
test("phones: the same line written three ways is one number", () => {
  assert.equal(normalizePhone("0712 345 678"), "254712345678");
  assert.equal(normalizePhone("+254712345678"), "254712345678");
  assert.equal(normalizePhone("254712345678"), "254712345678");
  assert.equal(normalizePhone("712345678"), "254712345678");
  assert.equal(normalizePhone("00254712345678"), "254712345678");
  assert.ok(samePhone("0712345678", "+254 712 345 678"));
});
test("phones: different lines, and rubbish, never match", () => {
  assert.ok(!samePhone("0712345678", "0712345679"));
  assert.ok(!samePhone("+256712345678", "0712345678"), "a Ugandan number is not a Kenyan one");
  for (const bad of [null, undefined, "", "abc", "12", {}, "+"]) assert.equal(normalizePhone(bad), null, String(bad));
  assert.ok(!samePhone("", ""));
});
test("phones: the spellings to search for include the common ones", () => {
  const v = phoneVariants("0712345678");
  for (const want of ["0712345678", "254712345678", "+254712345678", "712345678"]) assert.ok(v.includes(want), want);
  assert.deepEqual(phoneVariants("nonsense"), []);
});

// ---------- numbers ----------
test("numbers: countries are one key whatever the spelling", () => {
  assert.equal(countryKey("  KENYA "), "kenya");
  assert.equal(countryKey("South   Africa"), "south africa");
  assert.equal(countryKey(""), null);
  assert.equal(countryKey(5), null);
});
test("numbers: only dialable numbers are accepted", () => {
  assert.ok(cleanEntry({ label: "Police", number: "999" }));
  assert.ok(cleanEntry({ label: "Police", number: "+254 20 222 2222" }));
  for (const bad of ["99", "abc", "999; DROP", "12 34 56 78 90 12 34 56 78", "<script>", "+", ""]) {
    assert.equal(cleanEntry({ label: "x", number: bad }), null, bad);
  }
  assert.equal(cleanEntry({ label: "", number: "999" }), null);
  assert.equal(cleanEntry({ label: "x".repeat(61), number: "999" }), null);
});
test("numbers: a list needs 1 to 6 valid, different numbers", () => {
  assert.equal(validateNumbers([]).ok, false);
  assert.equal(validateNumbers("999").ok, false);
  assert.equal(validateNumbers(Array.from({ length: 7 }, (_, i) => ({ label: "n", number: `99${i}` }))).ok, false);
  assert.equal(validateNumbers([{ label: "a", number: "999" }, { label: "b", number: "9 99" }]).ok, false, "the same number twice");
  assert.deepEqual(validateNumbers([{ label: " Police ", number: " 999 " }]), { ok: true, numbers: [{ label: "Police", number: "999" }] });
});
test("numbers: a saved country wins, Kenya has a built-in default, anything else has none", () => {
  const saved = pickNumbers({ record: { country: "Kenya", numbers: [{ label: "Ours", number: "911" }] }, countryName: "Kenya" });
  assert.equal(saved.source, "database");
  assert.equal(saved.numbers[0].number, "911");
  const kenya = pickNumbers({ record: null, countryName: "kenya" });
  assert.equal(kenya.source, "default");
  assert.deepEqual(kenya.numbers.map((n) => n.number), ["999", "112"]);
  const unknown = pickNumbers({ record: null, countryName: "Atlantis" });
  assert.deepEqual([unknown.source, unknown.numbers], ["none", []]);
  assert.deepEqual(pickNumbers({ record: null, countryName: null }).numbers, []);
});
test("numbers service: from a university to its country's numbers; a bad id is no country", async () => {
  const service = createNumbersService({
    University: { findById: (id) => ({ select: () => ({ lean: async () => { if (id === "bad") throw new Error("cast"); return id === "u1" ? { country: "Kenya" } : { country: "Uganda" }; } }) }) },
    EmergencyNumber: { findOne: ({ countryKey: k }) => ({ lean: async () => (k === "uganda" ? { country: "Uganda", numbers: [{ label: "Police", number: "999" }] } : null) }) },
  });
  assert.equal((await service.forUniversity("u1")).source, "default");
  assert.equal((await service.forUniversity("u2")).source, "database");
  assert.equal((await service.forUniversity("bad")).source, "none");
  assert.equal((await service.forUniversity(undefined)).source, "none");
});

// ---------- the numbers endpoints ----------
function controller({ role = "superadmin", saved = [] } = {}) {
  const audit = [];
  const store = new Map(saved.map((r) => [r.countryKey, r]));
  const c = createEmergencyNumbersController({
    User: { findById: () => ({ select: async () => ({ universityId: "u1" }) }) },
    EmergencyNumber: {
      find: () => ({ sort: () => ({ lean: async () => [...store.values()] }) }),
      findOneAndUpdate: (filter, update) => ({ lean: async () => { const r = { countryKey: filter.countryKey, ...update.$set }; store.set(filter.countryKey, r); return r; } }),
    },
    service: { forUniversity: async () => ({ country: "Kenya", numbers: [{ label: "Police", number: "999" }], source: "default" }) },
    AuditLog: { create: async (r) => { audit.push(r); } },
    log: { error() {} },
  });
  const call = (fn, body) => new Promise((resolve) => {
    const res = { statusCode: 200, status(s) { this.statusCode = s; return this; }, json(b) { resolve({ status: this.statusCode, body: b }); } };
    c[fn]({ user: { id: "x", role, email: "e@x.test" }, body }, res);
  });
  return { call, audit, store };
}
test("endpoint: anyone signed in gets their own country's numbers", async () => {
  const r = await controller({ role: "student" }).call("getMyNumbers");
  assert.equal(r.status, 200);
  assert.equal(r.body.data.numbers[0].number, "999");
});
test("endpoint: only a superadmin sets or lists countries", async () => {
  for (const role of ["student", "lecturer", "admin"]) {
    const c = controller({ role });
    assert.equal((await c.call("setNumbers", { country: "Uganda", numbers: [{ label: "Police", number: "999" }] })).status, 403, role);
    assert.equal((await c.call("listAll")).status, 403, role);
    assert.equal(c.store.size, 0);
  }
});
test("endpoint: a superadmin adds a country, it is audited, and bad input is refused", async () => {
  const c = controller();
  const ok = await c.call("setNumbers", { country: " Uganda ", numbers: [{ label: "Police", number: "999" }, { label: "Ambulance", number: "112" }] });
  assert.equal(ok.status, 200);
  assert.equal(c.store.get("uganda").country, "Uganda");
  assert.equal(c.audit[0].action, "EMERGENCY_NUMBERS_SET");
  assert.equal((await c.call("setNumbers", { country: "", numbers: [{ label: "x", number: "999" }] })).status, 400);
  assert.equal((await c.call("setNumbers", { country: "Chad", numbers: [{ label: "x", number: "nope" }] })).status, 400);
  assert.equal((await c.call("setNumbers", { country: "Chad" })).status, 400);
  const all = await c.call("listAll");
  assert.deepEqual(all.body.data.map((d) => [d.country, d.source]).sort(), [["Kenya", "default"], ["Uganda", "database"]]);
});

// ---------- the alert ----------
function alerter({ users, numbers } = {}) {
  const sent = [];
  const live = [];
  const db = users;
  const matches = (u, filter) => Object.entries(filter).every(([k, v]) => {
    if (k === "$or") return v.some((alt) => matches(u, alt));
    if (v && typeof v === "object" && "$in" in v) return v.$in.includes(u[k]) || (v.$in.includes(null) && u[k] === undefined);
    if (v && typeof v === "object" && "$exists" in v) return (u[k] !== undefined) === v.$exists;
    if (v === null) return u[k] === null || u[k] === undefined;
    return u[k] === v;
  });
  const User = {
    findById: () => ({ select: () => ({ lean: async () => db.find((u) => u._id === "student") }) }),
    find: (filter) => ({ select: () => ({ lean: async () => db.filter((u) => matches(u, filter)) }) }),
  };
  const a = createEmergencyAlerter({
    User,
    notify: async (n) => { sent.push(n); },
    emitToUsers: (ids, event, payload) => live.push({ ids, event, payload }),
    numbersFor: async () => ({ numbers: numbers || [{ label: "Police", number: "999" }] }),
    log: { error() {} },
  });
  return { a, sent, live };
}
const people = () => [
  { _id: "student", name: "Amina", phone: "0711111111", universityId: "uniA", status: "active", role: "student", trustedContacts: [{ name: "Mum", phone: "+254722222222" }, { name: "Neighbour", phone: "0733333333" }] },
  { _id: "adminA", role: "admin", status: "active", universityId: "uniA" },
  { _id: "adminB", role: "admin", status: "active", universityId: "uniB" },
  { _id: "platform", role: "admin", status: "active" },
  { _id: "boss", role: "superadmin", status: "active" },
  { _id: "suspended", role: "admin", status: "suspended", universityId: "uniA" },
  { _id: "mum", role: "student", status: "active", phone: "0722222222", universityId: "uniB" },
  { _id: "stranger", role: "student", status: "active", phone: "0799999999", universityId: "uniA" },
];
const report = (type, extra = {}) => ({ _id: "r1", type, message: "I am hurt", location: "Library", ...extra });

test("SOS: this university's admins, platform admins, superadmins and contacts with UniLink are alerted", async () => {
  const { a, sent, live } = alerter({ users: people() });
  const count = await a.ring({ report: report("sos"), reporterId: "student" });
  assert.deepEqual(sent[0].recipientIds.sort(), ["adminA", "boss", "mum", "platform"]);
  assert.equal(count, 4);
  assert.ok(!sent[0].recipientIds.includes("adminB"), "another university's admin is left out");
  assert.ok(!sent[0].recipientIds.includes("suspended"));
  assert.ok(!sent[0].recipientIds.includes("stranger"), "someone who is not a contact is left out");
  assert.ok(!sent[0].recipientIds.includes("student"), "never the person who needs help");
  assert.equal(sent[0].type, "emergency_alert");
  assert.equal(sent[0].channelId, "emergency");
  assert.equal(sent[0].title, "🚨 SOS from Amina");
  assert.equal(sent[0].pushData.ring, "1");
  assert.equal(sent[0].pushData.phone, "0711111111");
  assert.deepEqual(JSON.parse(sent[0].pushData.numbers), [{ label: "Police", number: "999" }]);
  assert.equal(live[0].event, "emergency:alert");
  assert.deepEqual(live[0].ids.sort(), ["adminA", "boss", "mum", "platform"]);
});

test("a medical or safety report rings admins only, never contacts", async () => {
  for (const type of ["medical", "safety"]) {
    const { a, sent } = alerter({ users: people() });
    await a.ring({ report: report(type), reporterId: "student" });
    assert.deepEqual(sent[0].recipientIds.sort(), ["adminA", "boss", "platform"], type);
    assert.equal(sent[0].channelId, "emergency");
    assert.equal(sent[0].pushData.phone, "", "the student's phone number is shared for an SOS only");
  }
});

test("an abuse report is quiet and shows no details", async () => {
  const { a, sent, live } = alerter({ users: people() });
  await a.ring({ report: report("abuse", { message: "secret details", location: "Room 4" }), reporterId: "student" });
  assert.deepEqual(sent[0].recipientIds.sort(), ["adminA", "boss", "platform"]);
  assert.equal(sent[0].channelId, null);
  assert.equal(sent[0].pushData.ring, "0");
  assert.doesNotMatch(JSON.stringify([sent[0], live[0]]), /secret details|Room 4|Amina/);
});

test("an older admin account with no status field is still alerted", async () => {
  const users = people().map((u) => (u._id === "adminA" ? { _id: "adminA", role: "admin", universityId: "uniA" } : u));
  const { a, sent } = alerter({ users });
  await a.ring({ report: report("sos"), reporterId: "student" });
  assert.ok(sent[0].recipientIds.includes("adminA"));
  assert.ok(!sent[0].recipientIds.includes("suspended"), "a suspended admin is still left out");
});

test("nobody to tell is not an error", async () => {
  const lonely = [{ _id: "student", name: "Amina", universityId: "uniA", status: "active" }];
  const { a, sent } = alerter({ users: lonely });
  assert.equal(await a.ring({ report: report("sos"), reporterId: "student" }), 0);
  assert.equal(sent.length, 0);
});

test("a failure never escapes", async () => {
  const a = createEmergencyAlerter({
    User: { findById: () => { throw new Error("db down"); }, find: () => { throw new Error("db down"); } },
    notify: async () => {}, emitToUsers: () => {}, numbersFor: async () => ({ numbers: [] }), log: { error() {} },
  });
  assert.equal(await a.ring({ report: report("sos"), reporterId: "student" }), 0);
});

test("a person with no university alerts only platform admins and superadmins", async () => {
  const users = people().map((u) => (u._id === "student" ? { ...u, universityId: undefined } : u));
  const { a, sent } = alerter({ users });
  await a.ring({ report: report("medical"), reporterId: "student" });
  assert.deepEqual(sent[0].recipientIds.sort(), ["boss", "platform"]);
});

// ---------- push channel ----------
test("push: the emergency channel is sent only when asked for", () => {
  const token = "ExponentPushToken[abc123]";
  assert.equal("channelId" in buildMessages([token], { title: "t", body: "b", data: {} })[0], false);
  assert.equal(buildMessages([token], { title: "t", body: "b", data: {}, channelId: "emergency" })[0].channelId, "emergency");
});
