"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { normalizePhone, validateNewContact, normalizeContactPhones, MAX_CONTACTS } = require("../src/utils/trustedContact.rules");
const { createTrustedContacts } = require("../src/controllers/trustedContacts.controller");

test("Kenyan local, spaced, and international forms all become +254...", () => {
  for (const v of ["0712345678", "0712 345 678", "07-12-345-678", "(0712) 345678", "+254712345678", "254712345678", "00254712345678", " 0112345678 "]) {
    assert.match(normalizePhone(v), /^\+254[17]\d{8}$/, v);
  }
  assert.equal(normalizePhone("0712345678"), "+254712345678");
});

test("other countries need + or 00, and keep their own number", () => {
  assert.equal(normalizePhone("+256701234567"), "+256701234567");
  assert.equal(normalizePhone("00256701234567"), "+256701234567");
});

test("numbers that cannot receive an SMS are rejected", () => {
  for (const v of ["", "abc", "123", "0712", "07123456789", "+0712345678", "+254", "call me", "999", "+1234567", "0212345678", null, undefined, 712345678, {}]) {
    assert.equal(normalizePhone(v), null, String(v));
  }
});

test("a good contact is cleaned: trimmed name, normalised phone, capped relationship", () => {
  const r = validateNewContact({ name: "  Mama ", phone: "0712 345 678", relationship: "  Mother  " }, []);
  assert.deepEqual(r, { ok: true, contact: { name: "Mama", phone: "+254712345678", relationship: "Mother" } });
  assert.equal(validateNewContact({ name: "X", phone: "0712345678", relationship: "y".repeat(100) }, []).contact.relationship.length, 30);
});

test("missing name, long name and bad phone are 400s with a plain message", () => {
  for (const bad of [{ phone: "0712345678" }, { name: "  ", phone: "0712345678" }, { name: "x".repeat(61), phone: "0712345678" }, { name: "A", phone: "nope" }, null, undefined]) {
    const r = validateNewContact(bad, []);
    assert.equal(r.ok, false);
    assert.equal(r.status, 400);
  }
});

test("the sixth contact and a duplicate number are refused with 409", () => {
  const five = Array.from({ length: MAX_CONTACTS }, (_, i) => ({ name: `c${i}`, phone: `+25471234567${i}` }));
  assert.equal(validateNewContact({ name: "New", phone: "0722222222" }, five).status, 409);
  const dup = validateNewContact({ name: "Again", phone: "0712345670" }, five.slice(0, 1).map(() => ({ name: "a", phone: "+254712345670" })));
  assert.equal(dup.status, 409);
});

test("older contacts with local numbers are fixed at send time, unreadable ones pass through", () => {
  const out = normalizeContactPhones([{ name: "a", phone: "0712345678" }, { name: "b", phone: "garbage" }, { name: "c", phone: "+256701234567" }]);
  assert.deepEqual(out.map((c) => c.phone), ["+254712345678", "garbage", "+256701234567"]);
  assert.deepEqual(normalizeContactPhones(undefined), []);
  const doc = { name: "d", phone: "0712345678", toObject() { return { name: "d", phone: "0712345678", _id: "x" }; } };
  assert.deepEqual(normalizeContactPhones([doc])[0], { name: "d", phone: "+254712345678", _id: "x" });
});

const chain = (v) => { const o = { select: () => o, lean: () => o, then: (a, b) => Promise.resolve(v).then(a, b) }; return o; };
const res = () => { const out = { status: 200, body: null }; return { out, status(c) { out.status = c; return this; }, json(b) { out.body = b; return this; } }; };
const isValidId = (v) => /^[0-9a-f]{24}$/i.test(String(v));

test("add: saves a clean contact with the cap inside the update", async () => {
  let seen;
  const api = createTrustedContacts({
    User: {
      findById: () => chain({ trustedContacts: [] }),
      findOneAndUpdate: (filter, op) => { seen = { filter, op }; return chain({ trustedContacts: [op.$push.trustedContacts] }); },
    },
    isValidId,
  });
  const r = res();
  await api.add({ user: { id: "u" }, body: { name: "Mama", phone: "0712345678" } }, r);
  assert.equal(r.out.status, 201);
  assert.deepEqual(seen.filter, { _id: "u", "trustedContacts.4": { $exists: false } });
  assert.equal(seen.op.$push.trustedContacts.phone, "+254712345678");
});

test("add: if the cap was reached between the check and the write, it is a 409", async () => {
  const api = createTrustedContacts({ User: { findById: () => chain({ trustedContacts: [] }), findOneAndUpdate: () => chain(null) }, isValidId });
  const r = res();
  await api.add({ user: { id: "u" }, body: { name: "Mama", phone: "0712345678" } }, r);
  assert.equal(r.out.status, 409);
});

test("add: bad input never reaches the database write", async () => {
  let wrote = false;
  const api = createTrustedContacts({ User: { findById: () => chain({ trustedContacts: [] }), findOneAndUpdate: () => { wrote = true; return chain(null); } }, isValidId });
  const r = res();
  await api.add({ user: { id: "u" }, body: { name: "Mama", phone: "123" } }, r);
  assert.equal(r.out.status, 400);
  assert.equal(wrote, false);
});

test("remove: a malformed id is a 400, not a database error", async () => {
  const api = createTrustedContacts({ User: { findByIdAndUpdate: () => { throw new Error("must not run"); } }, isValidId });
  const r = res();
  await api.remove({ user: { id: "u" }, params: { contactId: "not-an-id" } }, r);
  assert.equal(r.out.status, 400);
});

test("remove: pulls exactly that contact", async () => {
  let seen;
  const api = createTrustedContacts({ User: { findByIdAndUpdate: (id, op) => { seen = op; return chain({ trustedContacts: [] }); } }, isValidId });
  const r = res();
  await api.remove({ user: { id: "u" }, params: { contactId: "a".repeat(24) } }, r);
  assert.equal(r.out.status, 200);
  assert.deepEqual(seen, { $pull: { trustedContacts: { _id: "a".repeat(24) } } });
});
