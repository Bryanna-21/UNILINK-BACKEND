"use strict";

// Sending push notifications through Expo in batches. Pure apart from the injected fetch and sleep,
// so every behaviour here is tested without the network.
const EXPO_PUSH_URL = "https://exp.host/--/api/v2/push/send";
const CHUNK_SIZE = 100; // Expo accepts at most 100 messages per request

const chunk = (arr, size = CHUNK_SIZE) => {
  const out = [];
  for (let i = 0; i < arr.length; i += size) out.push(arr.slice(i, i + size));
  return out;
};

const isExpoToken = (t) => typeof t === "string" && /^(ExponentPushToken|ExpoPushToken)\[[^\]\s]+\]$/.test(t);

// One message per distinct, valid token. Anything else (null, a stale or hand-typed value) is dropped.
function buildMessages(tokens, { title, body, data }) {
  return [...new Set(tokens)].filter(isExpoToken).map((to) => ({ to, title, body, data, sound: "default", priority: "high" }));
}

// Expo answers a batch with one ticket per message, in order. "DeviceNotRegistered" means the app was
// uninstalled or the token expired: that token should be forgotten.
function parseTickets(messages, tickets) {
  const result = { sent: 0, failed: 0, invalidTokens: [] };
  if (!Array.isArray(tickets)) {
    result.failed = messages.length;
    return result;
  }
  messages.forEach((m, i) => {
    const t = tickets[i];
    if (t && t.status === "ok") result.sent++;
    else {
      result.failed++;
      if (t?.details?.error === "DeviceNotRegistered") result.invalidTokens.push(m.to);
    }
  });
  return result;
}

const defaultSleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

async function postChunk(msgs, fetchImpl, sleep) {
  for (let attempt = 0; attempt < 3; attempt++) {
    try {
      const res = await fetchImpl(EXPO_PUSH_URL, {
        method: "POST",
        headers: { "Content-Type": "application/json", Accept: "application/json" },
        body: JSON.stringify(msgs),
      });
      if (res.status === 429 || res.status >= 500) {
        await sleep(1000 * (attempt + 1));
        continue;
      }
      const json = await res.json();
      return Array.isArray(json?.data) ? json.data : null;
    } catch {
      await sleep(1000 * (attempt + 1));
    }
  }
  return null;
}

// Returns { sent, failed, invalidTokens }. Never throws.
async function sendPushBatch(messages, { fetchImpl = fetch, sleep = defaultSleep } = {}) {
  const total = { sent: 0, failed: 0, invalidTokens: [] };
  for (const part of chunk(messages)) {
    const tickets = await postChunk(part, fetchImpl, sleep);
    const r = parseTickets(part, tickets);
    total.sent += r.sent;
    total.failed += r.failed;
    total.invalidTokens.push(...r.invalidTokens);
  }
  return total;
}

module.exports = { CHUNK_SIZE, chunk, isExpoToken, buildMessages, parseTickets, sendPushBatch };
