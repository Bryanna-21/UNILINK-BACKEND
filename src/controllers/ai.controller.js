const AiUsage = require("../models/AiUsage");

// Daily cap per user. Chosen conservatively since this is a real,
// billed API - easy to raise later once real usage patterns are known.
// Not configurable via request body (that would let a client raise its
// own limit), only via this constant.
const DAILY_LIMIT = 30;

const SYSTEM_PROMPT =
  "You are UNILINK AI, a study assistant for university students in Kenya using the " +
  "UniLink platform. Help with summarizing academic material, explaining concepts, " +
  "generating quiz questions, making flashcards, planning assignments, and study " +
  "scheduling. Keep answers focused on academic/study help. If asked something " +
  "clearly unrelated to studying or the platform, politely redirect. Keep responses " +
  "concise and readable on a mobile screen - avoid long unbroken paragraphs.";

function todayKeyUTC() {
  return new Date().toISOString().slice(0, 10); // "YYYY-MM-DD"
}

exports.ask = async (req, res) => {
  try {
    const { message, history } = req.body;

    if (!message || !message.trim()) {
      return res.status(400).json({ status: "error", message: "message is required" });
    }

    if (!process.env.GEMINI_API_KEY) {
      // Fail clearly rather than silently - if this ever shows up in
      // production it means the env var wasn't set, not a transient error.
      console.error("✗ GEMINI_API_KEY is not set - cannot serve AI requests");
      return res.status(503).json({
        status: "error",
        message: "AI assistant is not configured on the server yet.",
      });
    }

    // Atomic upsert-and-increment avoids a read-then-write race where
    // two concurrent requests from the same user could both pass a
    // separate "check the count" step before either increments it.
    const dateKey = todayKeyUTC();
    const usage = await AiUsage.findOneAndUpdate(
      { userId: req.user.id, dateKey },
      { $inc: { count: 1 } },
      { upsert: true, new: true }
    );

    if (usage.count > DAILY_LIMIT) {
      return res.status(429).json({
        status: "error",
        message: `You've reached today's limit of ${DAILY_LIMIT} AI requests. Try again tomorrow.`,
      });
    }

    // history is optional: an array of { role: "user"|"assistant", content: string }
    // from the mobile client's own visible chat log. Capped and
    // sanitized here rather than trusted wholesale from the client.
    const trimmedHistory = Array.isArray(history)
      ? history
          .filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string")
          .slice(-10)
          .map((m) => ({ role: m.role, content: m.content.slice(0, 2000) }))
      : [];

    const messages = [
      { role: "system", content: SYSTEM_PROMPT },
      ...trimmedHistory,
      { role: "user", content: message.trim().slice(0, 2000) },
    ];

    // Gemini's OpenAI-compatibility layer (Google's own documented
    // endpoint, not a third-party shim) accepts the standard OpenAI
    // chat completions request/response shape at this URL - same
    // fields (model, messages, max_tokens, temperature), same
    // response shape (choices[0].message.content), so the rest of
    // this function is unchanged from the OpenAI version. Verify
    // max_tokens/temperature are honored as expected once a real key
    // is set; the docs confirm the shape but this hasn't been
    // exercised against a live Gemini key from this codebase yet.
    const geminiRes = await fetch("https://generativelanguage.googleapis.com/v1beta/openai/chat/completions", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${process.env.GEMINI_API_KEY}`,
      },
      body: JSON.stringify({
        model: "gemini-2.5-flash",
        messages,
        max_tokens: 600,
        temperature: 0.5,
      }),
    });

    if (!geminiRes.ok) {
      const errText = await geminiRes.text().catch(() => "");
      console.error("✗ Gemini request failed:", geminiRes.status, errText);
      return res.status(502).json({
        status: "error",
        message: "The AI assistant is temporarily unavailable. Please try again shortly.",
      });
    }

    const data = await geminiRes.json();
    const reply = data?.choices?.[0]?.message?.content;

    if (!reply) {
      return res.status(502).json({
        status: "error",
        message: "The AI assistant returned an unexpected response. Please try again.",
      });
    }

    res.status(200).json({
      status: "success",
      data: { reply, remainingToday: Math.max(DAILY_LIMIT - usage.count, 0) },
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error contacting AI assistant: " + error.message });
  }
};
