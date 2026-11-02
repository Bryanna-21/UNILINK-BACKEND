"use strict";

// Voice and video calls inside direct chats. All the decisions are in utils/call.rules.js; this
// file loads the facts, applies a decision with a guarded update, and tells people. Dependencies
// are injected so the exact code that runs in production is tested without a database or the
// network (tests/call.service.test.js); call.instance.js wires in the real ones.
//
// Every state change is an atomic "only if it is still in the state I read" update, and only the
// request that WINS the update sends the chat log line or the push. Two taps at once, a timer and
// a hang-up at the same moment: exactly one of them acts.
//
// Signalling is by push plus polling, the way the chat already works: the app polls
// GET /calls/incoming and GET /calls/:id every couple of seconds while a call is on screen.

const rules = require("../utils/call.rules");

// The same daily cap as the study assistant (controllers/ai.controller.js). Both count into the
// same AiUsage document, so a person cannot get 30 from each.
const AI_DAILY_LIMIT = 30;

const ASK_SYSTEM =
  "You are UniLink AI, helping a student during a phone or video call with a classmate or lecturer. " +
  "Answer the question clearly and briefly so it can be read at a glance on a phone. " +
  "Help with studying, explaining ideas, planning and wording. If the question is clearly unrelated " +
  "to studying or university life, politely say so.";

const RECAP_SYSTEM =
  "You write a short recap of a call from the notes a student typed during it. " +
  "Use ONLY the notes you are given. Never invent facts, names, dates or decisions. " +
  "Reply in this format, leaving out any heading that has nothing under it:\n" +
  "Summary: 2 to 4 short bullets\nDecisions: bullets\nAction items: bullets, with who it is for if the notes say\nOpen questions: bullets\n" +
  "Keep it under 150 words.";

function createCallService({
  Call, Conversation, User, Message, peopleService, AiUsage, gemini,
  getConfig, getLiveKit, buildAccessToken, sendPushBatch, isExpoToken, newId,
  now = () => Date.now(), schedule = (fn, ms) => setTimeout(fn, ms), log = console,
}) {
  const t = () => new Date(now());

  // At most 6 new calls a minute per person, so nobody can ring someone over and over.
  const starts = new Map();
  function tooManyStarts(userId) {
    const cutoff = now() - 60 * 1000;
    const recent = (starts.get(String(userId)) || []).filter((x) => x > cutoff);
    if (recent.length >= 6) {
      starts.set(String(userId), recent);
      return true;
    }
    recent.push(now());
    starts.set(String(userId), recent);
    return false;
  }

  const ok = (status, body) => ({ status, body: { status: "success", ...body } });
  const err = (status, code, message) => ({ status, body: { status: "error", code, message } });
  const fromRule = (r) => err(r.status, r.code, r.message);

  async function namesFor(ids) {
    const unique = [...new Set(ids.map(String))];
    if (!unique.length) return {};
    const people = await User.find({ _id: { $in: unique } }).select("name").lean();
    return Object.fromEntries(people.map((p) => [String(p._id), p.name || ""]));
  }

  async function openCallsFor(userIds) {
    const since = new Date(now() - rules.ACTIVE_MAX_MS);
    const docs = await Call.find({ participantIds: { $in: userIds.map(String) }, status: { $in: rules.OPEN }, createdAt: { $gte: since } }).lean();
    return docs.filter((c) => rules.isOpen(c, now()));
  }

  // Side effects that follow a call finishing. Never throw: a call must not fail because the chat
  // line or a push could not be sent.
  async function writeChatLine(call) {
    try {
      await Message.create({
        conversationId: String(call.conversationId),
        senderId: String(call.callerId),
        text: rules.callLogText(call),
        readBy: [String(call.callerId)],
      });
      await Conversation.updateOne({ _id: call.conversationId }, { $set: { lastMessageAt: t() } });
    } catch (error) {
      log.error("[calls] could not write the chat line:", error.message);
    }
  }

  async function pushTo(userId, message) {
    try {
      const u = await User.findById(userId).select("pushToken").lean();
      if (!u || !isExpoToken(u.pushToken)) return;
      await sendPushBatch([{ to: u.pushToken, sound: "default", priority: "high", ...message }]);
    } catch (error) {
      log.error("[calls] push failed:", error.message);
    }
  }

  // ringing -> missed, by timer or lazily. Only the winner writes the chat line and the push.
  async function markMissed(callId) {
    const lost = await Call.findOneAndUpdate(
      { _id: callId, status: "ringing" },
      { $set: { status: "missed", endedAt: t(), endReason: "no_answer" } },
      { new: true }
    ).lean();
    if (!lost) return null;
    await writeChatLine(lost);
    const names = await namesFor([lost.callerId]);
    const callee = lost.participantIds.map(String).find((id) => id !== String(lost.callerId));
    if (callee) {
      await pushTo(callee, {
        title: "Missed call",
        body: `${names[String(lost.callerId)] || "Someone"} tried to reach you`,
        data: { type: "missed_call", conversationId: String(lost.conversationId), callId: String(lost._id) },
        channelId: "default",
      });
    }
    return lost;
  }

  // If a call has outlived what its state says, bring the database in line.
  async function settle(call) {
    const status = rules.effectiveStatus(call, now());
    if (status === call.status) return call;
    if (status === "missed") return (await markMissed(call._id)) || { ...call, status: "missed" };
    if (status === "ended") {
      const ended = await Call.findOneAndUpdate(
        { _id: call._id, status: "active" },
        { $set: { status: "ended", endedAt: t(), endReason: "stale" } },
        { new: true }
      ).lean();
      return ended || { ...call, status: "ended" };
    }
    return call;
  }

  function joinInfo(call, userId, name) {
    const lk = getLiveKit();
    if (!lk) return null;
    return {
      url: lk.url,
      token: buildAccessToken({ apiKey: lk.apiKey, apiSecret: lk.apiSecret, identity: String(userId), name, room: call.room, type: call.type }),
    };
  }

  function guardAvailable() {
    if (!getConfig().features.calls) return err(403, "CALLS_DISABLED", "Calls are not available yet.");
    if (!getLiveKit()) return err(503, "CALLS_NOT_CONFIGURED", "Calls are not set up on the server yet.");
    return null;
  }

  // ---------------------------------------------------------------- start
  async function startCall(userId, { conversationId, type } = {}) {
    const unavailable = guardAvailable();
    if (unavailable) return unavailable;
    if (tooManyStarts(userId)) return err(429, "TOO_MANY", "You are calling too often. Wait a moment and try again.");
    if (typeof conversationId !== "string" || !/^[0-9a-f]{24}$/i.test(conversationId)) {
      return err(400, "BAD_CONVERSATION", "Invalid conversation.");
    }
    const [caller, conversation] = await Promise.all([
      User.findById(userId).select("name status").lean(),
      Conversation.findById(conversationId).lean(),
    ]);
    if (!caller || caller.status === "suspended" || caller.status === "terminated") {
      return err(403, "NOT_ALLOWED", "Your account cannot make calls right now.");
    }

    const ids = (conversation?.participantIds || []).map(String);
    const calleeId = ids.find((id) => id !== String(userId));
    const blocked = calleeId ? await peopleService.eitherBlocked(userId, calleeId) : false;
    const busy = ids.length ? (await openCallsFor(ids)).flatMap((c) => c.participantIds.map(String)).filter((id) => ids.includes(id)) : [];

    const check = rules.checkCanStart({ conversation, callerId: userId, type, blocked, busy });
    if (!check.ok) return fromRule(check);

    const callee = await User.findById(check.calleeId).select("name status pushToken deletedAt").lean();
    if (!callee || callee.deletedAt || callee.status === "terminated") return err(404, "NOT_FOUND", "That person is not available.");

    const _id = newId();
    const call = await Call.create({
      _id,
      conversationId,
      callerId: String(userId),
      participantIds: [String(userId), String(check.calleeId)],
      type,
      status: "ringing",
      room: `call-${_id}`,
      createdAt: t(),
    });
    const plain = typeof call.toObject === "function" ? call.toObject() : call;

    await pushTo(check.calleeId, {
      title: caller.name || "Incoming call",
      body: type === "video" ? "Incoming video call" : "Incoming voice call",
      data: { type: "incoming_call", callId: String(_id), conversationId, callType: type, callerName: caller.name || "" },
      channelId: "calls",
      ttl: Math.round(rules.RING_MS / 1000),
    });

    // The server may restart, so this timer is a nicety; settle() covers it on the next read.
    schedule(() => markMissed(_id).catch((e) => log.error("[calls] missed timer:", e.message)), rules.RING_MS + 1500);

    const names = { [String(userId)]: caller.name || "", [String(check.calleeId)]: callee.name || "" };
    return ok(201, { call: rules.shapeCall(plain, userId, names) });
  }

  // ---------------------------------------------------------------- read
  async function getCall(userId, callId) {
    const found = await loadCall(callId);
    if (!found) return err(404, "NOT_FOUND", "Call not found.");
    const check = rules.checkCanAct(found, userId, "read", now());
    if (!check.ok) return fromRule(check);
    const call = await settle(found);
    const names = await namesFor(call.participantIds);
    const body = { call: rules.shapeCall(call, userId, names) };
    // Once the call is active, whoever asks (a participant) gets a fresh token to join with.
    if (call.status === "active") {
      const join = joinInfo(call, userId, names[String(userId)]);
      if (join) Object.assign(body, join);
    }
    return ok(200, body);
  }

  async function loadCall(callId) {
    if (typeof callId !== "string" || !/^[0-9a-f]{24}$/i.test(callId)) return null;
    return Call.findById(callId).lean();
  }

  // ---------------------------------------------------------------- incoming
  async function incoming(userId) {
    const since = new Date(now() - rules.RING_MS);
    const docs = await Call.find({
      participantIds: String(userId),
      callerId: { $ne: String(userId) },
      status: "ringing",
      createdAt: { $gte: since },
    })
      .sort({ createdAt: -1 })
      .limit(3)
      .lean();
    const live = docs.filter((c) => rules.effectiveStatus(c, now()) === "ringing");
    const names = await namesFor(live.flatMap((c) => c.participantIds));
    return ok(200, { count: live.length, data: live.map((c) => rules.shapeCall(c, userId, names)) });
  }

  // ---------------------------------------------------------------- accept
  async function accept(userId, callId) {
    const unavailable = guardAvailable();
    if (unavailable) return unavailable;
    const found = await loadCall(callId);
    const check = rules.checkCanAct(found, userId, "accept", now());
    if (!check.ok) {
      if (check.code === "NOT_RINGING" && found) await settle(found);
      return fromRule(check);
    }
    const won = await Call.findOneAndUpdate(
      { _id: callId, status: "ringing" },
      { $set: { status: "active", answeredAt: t() } },
      { new: true }
    ).lean();
    if (!won) return err(409, "NOT_RINGING", "This call is over.");
    const names = await namesFor(won.participantIds);
    return ok(200, { call: rules.shapeCall(won, userId, names), ...joinInfo(won, userId, names[String(userId)]) });
  }

  // ---------------------------------------------------------------- decline / cancel / end
  async function finish(userId, callId, action, toStatus, reason) {
    const found = await loadCall(callId);
    const check = rules.checkCanAct(found, userId, action, now());
    if (!check.ok) return fromRule(check);
    const won = await Call.findOneAndUpdate(
      { _id: callId, status: "ringing" },
      { $set: { status: toStatus, endedAt: t(), endReason: reason } },
      { new: true }
    ).lean();
    if (!won) return err(409, "NOT_RINGING", "This call is no longer ringing.");
    await writeChatLine(won);
    const names = await namesFor(won.participantIds);
    return ok(200, { call: rules.shapeCall(won, userId, names) });
  }

  const decline = (userId, callId) => finish(userId, callId, "decline", "declined", "declined");
  const cancel = (userId, callId) => finish(userId, callId, "cancel", "cancelled", "cancelled");

  async function end(userId, callId) {
    const found = await loadCall(callId);
    const check = rules.checkCanAct(found, userId, "end", now());
    if (!check.ok) return fromRule(check);
    const status = rules.effectiveStatus(found, now());

    if (status === "ringing") {
      // Hanging up while it still rings: the caller cancels. The callee ending a ringing call is a decline.
      return String(found.callerId) === String(userId) ? cancel(userId, callId) : decline(userId, callId);
    }

    if (status === "active") {
      const won = await Call.findOneAndUpdate(
        { _id: callId, status: "active" },
        { $set: { status: "ended", endedAt: t(), endReason: "hangup" } },
        { new: true }
      ).lean();
      if (won) await writeChatLine(won);
    }
    // Already finished: nothing to do, and no second chat line. Hanging up twice is harmless.
    const fresh = (await loadCall(callId)) || found;
    const names = await namesFor(fresh.participantIds);
    return ok(200, { call: rules.shapeCall(fresh, userId, names) });
  }

  // ---------------------------------------------------------------- history
  async function history(userId, { conversationId } = {}) {
    const filter = { participantIds: String(userId) };
    if (typeof conversationId === "string" && /^[0-9a-f]{24}$/i.test(conversationId)) filter.conversationId = conversationId;
    const docs = await Call.find(filter).sort({ createdAt: -1 }).limit(30).lean();
    const names = await namesFor(docs.flatMap((c) => c.participantIds));
    return ok(200, { count: docs.length, data: docs.map((c) => rules.shapeCall({ ...c, status: rules.effectiveStatus(c, now()) }, userId, names)) });
  }

  // ---------------------------------------------------------------- AI
  // mode "ask": a question during the call. mode "recap": notes typed during the call turned into a
  // summary. Nothing is stored: no question, no notes, no answer. The two people see only their own.
  async function ai(userId, callId, { mode, message, notes, history: past } = {}) {
    const found = await loadCall(callId);
    const check = rules.checkCanAct(found, userId, "read", now());
    if (!check.ok) return fromRule(check);
    const status = rules.effectiveStatus(found, now());
    const recent = status === "ended" && now() - new Date(found.endedAt).getTime() <= rules.AI_WINDOW_MS;
    if (status !== "active" && !recent) return err(409, "CALL_OVER", "The AI assistant is available during a call and for a day after it.");

    let messages;
    if (mode === "ask") {
      const q = typeof message === "string" ? message.trim().slice(0, 1000) : "";
      if (!q) return err(400, "EMPTY", "Type your question.");
      const earlier = Array.isArray(past)
        ? past.filter((m) => m && (m.role === "user" || m.role === "assistant") && typeof m.content === "string").slice(-6).map((m) => ({ role: m.role, content: m.content.slice(0, 1000) }))
        : [];
      messages = [{ role: "system", content: ASK_SYSTEM }, ...earlier, { role: "user", content: q }];
    } else if (mode === "recap") {
      const n = typeof notes === "string" ? notes.trim().slice(0, 6000) : "";
      if (n.length < 20) return err(400, "TOO_SHORT", "Write a few lines of notes first, then ask for a recap.");
      messages = [{ role: "system", content: RECAP_SYSTEM }, { role: "user", content: `Notes from the call:\n${n}` }];
    } else {
      return err(400, "BAD_MODE", "Choose ask or recap.");
    }

    // Counts before the call to Gemini, atomically, exactly as the study assistant does.
    const dateKey = t().toISOString().slice(0, 10);
    const usage = await AiUsage.findOneAndUpdate({ userId: String(userId), dateKey }, { $inc: { count: 1 } }, { upsert: true, new: true });
    if (usage.count > AI_DAILY_LIMIT) {
      return err(429, "LIMIT", `You've reached today's limit of ${AI_DAILY_LIMIT} AI requests. Try again tomorrow.`);
    }

    const result = await gemini.complete({ messages, maxTokens: mode === "recap" ? 500 : 450 });
    if (!result.ok) {
      if (result.status === 503) return err(503, "AI_NOT_CONFIGURED", "The AI assistant is not configured on the server yet.");
      return err(502, "AI_UNAVAILABLE", "The AI assistant is temporarily unavailable. Please try again shortly.");
    }
    return ok(200, { data: { reply: result.text, remainingToday: Math.max(AI_DAILY_LIMIT - usage.count, 0) } });
  }

  return { startCall, getCall, incoming, accept, decline, cancel, end, history, ai, markMissed };
}

module.exports = { createCallService, AI_DAILY_LIMIT };
