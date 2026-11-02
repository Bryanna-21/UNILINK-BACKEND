"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createGemini, ENDPOINT, MODEL } = require("../src/services/gemini.service");

const okRes = (text) => ({ ok: true, json: async () => ({ choices: [{ message: { content: text } }] }) });

test("a good answer comes back as text, sent to the same endpoint and model as the study assistant", async () => {
  let seen;
  const g = createGemini({ getKey: () => "KEY", fetchImpl: async (url, init) => { seen = { url, init }; return okRes("Hello"); } });
  const r = await g.complete({ messages: [{ role: "user", content: "hi" }], maxTokens: 100 });
  assert.deepEqual(r, { ok: true, text: "Hello" });
  assert.equal(seen.url, ENDPOINT);
  assert.equal(seen.init.headers.Authorization, "Bearer KEY");
  const body = JSON.parse(seen.init.body);
  assert.equal(body.model, MODEL);
  assert.equal(body.max_tokens, 100);
});

test("no key is a 503, never a request", async () => {
  let called = false;
  const g = createGemini({ getKey: () => "", fetchImpl: async () => { called = true; return okRes("x"); } });
  assert.deepEqual(await g.complete({ messages: [] }), { ok: false, status: 503, reason: "not_configured" });
  assert.equal(called, false);
});

test("an upstream error, an empty answer and a network failure are all 502, and nothing throws", async () => {
  const cases = [
    async () => ({ ok: false, status: 429, json: async () => ({}) }),
    async () => okRes(""),
    async () => ({ ok: true, json: async () => ({}) }),
    async () => { throw new Error("offline"); },
    async () => ({ ok: true, json: async () => { throw new Error("bad json"); } }),
  ];
  for (const fetchImpl of cases) {
    const r = await createGemini({ getKey: () => "KEY", fetchImpl }).complete({ messages: [] });
    assert.equal(r.ok, false);
    assert.equal(r.status, 502);
  }
});
