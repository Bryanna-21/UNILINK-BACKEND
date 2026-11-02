"use strict";

// Thin HTTP layer for calls. The service returns { status, body }; this sends it. An unexpected
// error becomes a plain 500 that never leaks internals.

const calls = require("../services/call.instance");

const send = (res, result) => res.status(result.status).json(result.body);

const handle = (fn) => async (req, res) => {
  try {
    send(res, await fn(req));
  } catch (error) {
    console.error("[calls] request failed:", error.message);
    res.status(500).json({ status: "error", code: "SERVER", message: "Something went wrong with the call. Try again." });
  }
};

module.exports = {
  handle,
  start: handle((req) => calls.startCall(req.user.id, req.body || {})),
  get: handle((req) => calls.getCall(req.user.id, req.params.id)),
  incoming: handle((req) => calls.incoming(req.user.id)),
  accept: handle((req) => calls.accept(req.user.id, req.params.id)),
  decline: handle((req) => calls.decline(req.user.id, req.params.id)),
  cancel: handle((req) => calls.cancel(req.user.id, req.params.id)),
  end: handle((req) => calls.end(req.user.id, req.params.id)),
  history: handle((req) => calls.history(req.user.id, { conversationId: req.query.conversationId })),
  ai: handle((req) => calls.ai(req.user.id, req.params.id, req.body || {})),
};
