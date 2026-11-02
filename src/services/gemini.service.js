"use strict";

// One place that talks to Gemini for the call assistant, using the same endpoint and model as the
// study assistant (controllers/ai.controller.js). The network call is injected so it is tested
// without the internet. Returns { ok:true, text } or { ok:false, status, reason }; never throws.

const ENDPOINT = "https://generativelanguage.googleapis.com/v1beta/openai/chat/completions";
const MODEL = "gemini-3.6-flash";

function createGemini({ fetchImpl = (...a) => fetch(...a), getKey = () => process.env.GEMINI_API_KEY } = {}) {
  async function complete({ messages, maxTokens = 600, temperature = 0.4 }) {
    const key = getKey();
    if (!key) return { ok: false, status: 503, reason: "not_configured" };
    try {
      const res = await fetchImpl(ENDPOINT, {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${key}` },
        body: JSON.stringify({ model: MODEL, messages, max_tokens: maxTokens, temperature }),
      });
      if (!res.ok) return { ok: false, status: 502, reason: `upstream_${res.status}` };
      const data = await res.json();
      const text = data?.choices?.[0]?.message?.content;
      if (!text || typeof text !== "string") return { ok: false, status: 502, reason: "empty" };
      return { ok: true, text };
    } catch (error) {
      return { ok: false, status: 502, reason: "network" };
    }
  }
  return { complete };
}

module.exports = { createGemini, ENDPOINT, MODEL };
