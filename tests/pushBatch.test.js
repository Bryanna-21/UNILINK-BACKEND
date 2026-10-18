const test = require("node:test");
const assert = require("node:assert/strict");
const { chunk, isExpoToken, buildMessages, parseTickets, sendPushBatch } = require("../src/utils/pushBatch");
const { buildAudienceFilter } = require("../src/utils/audience.rules");

const tok = (n) => `ExponentPushToken[abc${n}]`;
const noSleep = async () => {};
const ok = (n) => Array.from({ length: n }, () => ({ status: "ok", id: "x" }));
const reply = (status, data) => ({ status, json: async () => ({ data }) });

test("tokens are validated, deduplicated and anything else is dropped", () => {
  assert.equal(isExpoToken(tok(1)), true);
  assert.equal(isExpoToken("ExpoPushToken[zzz]"), true);
  for (const bad of [null, undefined, "", "abc", "ExponentPushToken[]", "ExponentPushToken[a b]", 5]) assert.equal(isExpoToken(bad), false, String(bad));
  const m = buildMessages([tok(1), tok(1), null, "junk", tok(2)], { title: "T", body: "B", data: { a: 1 } });
  assert.deepEqual(m.map((x) => x.to), [tok(1), tok(2)]);
  assert.equal(m[0].title, "T");
  assert.equal(m[0].priority, "high");
});

test("250 messages go out as batches of 100, 100 and 50", async () => {
  const sizes = [];
  const fetchImpl = async (_url, opts) => {
    const body = JSON.parse(opts.body);
    sizes.push(body.length);
    return reply(200, ok(body.length));
  };
  const msgs = buildMessages(Array.from({ length: 250 }, (_, i) => tok(i)), { title: "t", body: "b" });
  const r = await sendPushBatch(msgs, { fetchImpl, sleep: noSleep });
  assert.deepEqual(sizes, [100, 100, 50]);
  assert.deepEqual(r, { sent: 250, failed: 0, invalidTokens: [] });
  assert.deepEqual(chunk([1, 2, 3, 4, 5], 2), [[1, 2], [3, 4], [5]]);
});

test("a device that no longer exists is reported so its token can be cleared", async () => {
  const msgs = buildMessages([tok(1), tok(2), tok(3)], { title: "t", body: "b" });
  const fetchImpl = async () => reply(200, [{ status: "ok" }, { status: "error", details: { error: "DeviceNotRegistered" } }, { status: "error", details: { error: "MessageRateExceeded" } }]);
  const r = await sendPushBatch(msgs, { fetchImpl, sleep: noSleep });
  assert.deepEqual(r, { sent: 1, failed: 2, invalidTokens: [tok(2)] });
});

test("a busy server is retried and then succeeds", async () => {
  let calls = 0;
  const fetchImpl = async () => (++calls < 3 ? reply(429, null) : reply(200, ok(1)));
  const r = await sendPushBatch(buildMessages([tok(1)], { title: "t", body: "b" }), { fetchImpl, sleep: noSleep });
  assert.equal(calls, 3);
  assert.equal(r.sent, 1);
});

test("a network that keeps failing counts as failed and never throws", async () => {
  const fetchImpl = async () => { throw new Error("offline"); };
  const r = await sendPushBatch(buildMessages([tok(1), tok(2)], { title: "t", body: "b" }), { fetchImpl, sleep: noSleep });
  assert.deepEqual(r, { sent: 0, failed: 2, invalidTokens: [] });
});

test("a malformed answer counts every message as failed", () => {
  assert.deepEqual(parseTickets([{ to: tok(1) }, { to: tok(2) }], null), { sent: 0, failed: 2, invalidTokens: [] });
});

test("audience: a university's students and lecturers, never removed or suspended people", () => {
  const f = buildAudienceFilter({ universityId: 42, roles: ["student", "lecturer"] });
  assert.deepEqual(f.role, { $in: ["student", "lecturer"] });
  assert.equal(f.universityId, "42");
  assert.equal(f.removedAt, null);
  assert.equal(f.deletedAt, null);
  assert.deepEqual(f.status, { $nin: ["terminated", "suspended"] });
  assert.equal("campusId" in f, false);
});

test("audience: UniLink-wide has no university filter and a campus narrows it", () => {
  assert.equal("universityId" in buildAudienceFilter({ universityId: "GLOBAL", roles: ["student"] }), false);
  assert.equal(buildAudienceFilter({ universityId: "U1", campusId: "C9", roles: ["student"] }).campusId, "C9");
});
