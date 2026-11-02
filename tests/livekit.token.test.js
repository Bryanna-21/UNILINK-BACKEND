"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const jwt = require("jsonwebtoken");
const { buildAccessToken, readLiveKitConfig } = require("../src/utils/livekit.token");

const base = { apiKey: "APIkey123", apiSecret: "s".repeat(40), identity: "u1", name: "Amina", room: "call-1", type: "video" };

test("the token is signed with the secret and carries the key, identity and room", () => {
  const token = buildAccessToken(base);
  const claims = jwt.verify(token, base.apiSecret, { algorithms: ["HS256"] });
  assert.equal(claims.iss, "APIkey123");
  assert.equal(claims.sub, "u1");
  assert.equal(claims.name, "Amina");
  assert.equal(claims.video.room, "call-1");
  assert.equal(claims.video.roomJoin, true);
  assert.equal(claims.video.canSubscribe, true);
});

test("it does not verify with any other secret", () => {
  const token = buildAccessToken(base);
  assert.throws(() => jwt.verify(token, "x".repeat(40), { algorithms: ["HS256"] }));
});

test("a voice call can publish only a microphone; a video call a camera and a microphone", () => {
  assert.deepEqual(jwt.decode(buildAccessToken({ ...base, type: "voice" })).video.canPublishSources, ["microphone"]);
  assert.deepEqual(jwt.decode(buildAccessToken({ ...base, type: "video" })).video.canPublishSources, ["camera", "microphone"]);
});

test("the token expires, by default in an hour", () => {
  const c = jwt.decode(buildAccessToken(base));
  assert.equal(c.exp - c.iat, 3600);
  const short = jwt.decode(buildAccessToken({ ...base, ttlSec: 120 }));
  assert.equal(short.exp - short.iat, 120);
});

test("it refuses to build without configuration, an identity or a room", () => {
  assert.throws(() => buildAccessToken({ ...base, apiKey: "" }));
  assert.throws(() => buildAccessToken({ ...base, apiSecret: "" }));
  assert.throws(() => buildAccessToken({ ...base, identity: "" }));
  assert.throws(() => buildAccessToken({ ...base, room: "" }));
});

test("a missing name falls back to the identity", () => {
  assert.equal(jwt.decode(buildAccessToken({ ...base, name: "" })).name, "u1");
});

test("configuration needs all three settings and a websocket address", () => {
  assert.deepEqual(readLiveKitConfig({ LIVEKIT_URL: "wss://x.livekit.cloud", LIVEKIT_API_KEY: "k", LIVEKIT_API_SECRET: "s" }), { url: "wss://x.livekit.cloud", apiKey: "k", apiSecret: "s" });
  assert.equal(readLiveKitConfig({ LIVEKIT_URL: "wss://x", LIVEKIT_API_KEY: "k" }), null);
  assert.equal(readLiveKitConfig({ LIVEKIT_API_KEY: "k", LIVEKIT_API_SECRET: "s" }), null);
  assert.equal(readLiveKitConfig({ LIVEKIT_URL: "https://x.livekit.cloud", LIVEKIT_API_KEY: "k", LIVEKIT_API_SECRET: "s" }), null, "an https address would not connect");
  assert.equal(readLiveKitConfig({}), null);
  assert.deepEqual(readLiveKitConfig({ LIVEKIT_URL: "  ws://localhost:7880 ", LIVEKIT_API_KEY: " k ", LIVEKIT_API_SECRET: " s " }), { url: "ws://localhost:7880", apiKey: "k", apiSecret: "s" });
});
