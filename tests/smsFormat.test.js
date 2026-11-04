"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");

// The SMS to trusted contacts, with Twilio replaced, so this checks exactly what would be sent.
const calls = [];
let failFor = null;
const twilioPath = require.resolve("twilio");
require.cache[twilioPath] = {
  id: twilioPath, filename: twilioPath, loaded: true,
  exports: () => ({ messages: { create: async (m) => { calls.push(m); if (failFor && m.to === failFor) throw new Error("Twilio refused"); } } }),
};
delete process.env.TWILIO_ACCOUNT_SID; delete process.env.TWILIO_AUTH_TOKEN; delete process.env.TWILIO_PHONE_NUMBER;
const { sendSOSAlert } = require("../src/utils/sms.util");
const { toE164 } = require("../src/utils/phone.rules");

test("without Twilio credentials nothing is sent and nothing throws", async () => {
  const r = await sendSOSAlert({ contacts: [{ name: "Mum", phone: "0722222222" }], studentName: "Amina", location: "Library" });
  assert.deepEqual(r, [{ name: "Mum", phone: "0722222222", smsStatus: "not_configured" }]);
  assert.equal(calls.length, 0);
});

test("toE164: the forms people save become the one form Twilio accepts", () => {
  assert.equal(toE164("0712 345 678"), "+254712345678");
  assert.equal(toE164("+254712345678"), "+254712345678");
  assert.equal(toE164("254712345678"), "+254712345678");
  assert.equal(toE164("+256 712 345 678"), "+256712345678", "another country's number is kept as it is");
  for (const bad of ["", "abc", "12", null, undefined]) assert.equal(toE164(bad), null, String(bad));
});

test("with credentials, local numbers are sent in international form", async () => {
  process.env.TWILIO_ACCOUNT_SID = "ACtest"; process.env.TWILIO_AUTH_TOKEN = "token"; process.env.TWILIO_PHONE_NUMBER = "+15005550006";
  const r = await sendSOSAlert({ contacts: [{ name: "Mum", phone: "0722 222 222" }, { name: "Dad", phone: "+254733333333" }], studentName: "Amina", location: "Library" });
  assert.deepEqual(calls.map((c) => c.to), ["+254722222222", "+254733333333"]);
  assert.deepEqual(r.map((x) => x.smsStatus), ["sent", "sent"]);
  assert.equal(calls[0].from, "+15005550006");
  assert.match(calls[0].body, /Amina/);
  assert.match(calls[0].body, /Library/);
});

test("a number that cannot be texted is reported as failed without calling Twilio, and the rest still go", async () => {
  calls.length = 0;
  const r = await sendSOSAlert({ contacts: [{ name: "Bad", phone: "not a number" }, { name: "Mum", phone: "0722222222" }], studentName: "Amina", location: "" });
  assert.deepEqual(r.map((x) => x.smsStatus), ["failed", "sent"]);
  assert.deepEqual(calls.map((c) => c.to), ["+254722222222"]);
});

test("one contact Twilio refuses does not stop the others", async () => {
  calls.length = 0;
  failFor = "+254711111111";
  const r = await sendSOSAlert({ contacts: [{ name: "A", phone: "0711111111" }, { name: "B", phone: "0722222222" }], studentName: "Amina", location: "" });
  assert.deepEqual(r.map((x) => x.smsStatus), ["failed", "sent"]);
});
