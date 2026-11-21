"use strict";

// Who may open a real-time connection, and how fast they may talk. Models and jwt are injected, so this is
// unit-tested without a server (tests/socketAuth.test.js). Before this a socket only needed a validly SIGNED token:
// a suspended, removed or "signed out everywhere" account could keep a live connection, and any website could
// open one (the browser origin was "*").

const { accountBlock } = require("../utils/moderation.rules");

class SocketAuthError extends Error {
  constructor(message) { super(message); this.safeMessage = message; }
}

async function authenticateSocket({ token, jwt, User, secret, now = () => new Date() }) {
  if (typeof token !== "string" || token === "") throw new SocketAuthError("Authentication required");
  let decoded;
  try {
    decoded = jwt.verify(token, secret, { algorithms: ["HS256"] });
  } catch {
    throw new SocketAuthError("Invalid or expired token");
  }
  if (!decoded || typeof decoded.id !== "string" || !/^[a-f\d]{24}$/i.test(decoded.id)) throw new SocketAuthError("Invalid or expired token");

  const user = await User.findById(decoded.id).select("tokenVersion status suspendedUntil deletedAt removedAt");
  if (!user || user.tokenVersion !== decoded.tokenVersion) throw new SocketAuthError("Session expired");
  if (accountBlock(user, now())) throw new SocketAuthError("Account not available");
  return decoded;
}

// Browsers send an Origin; the apps do not. Apps are always welcome; browsers only from the listed sites in production.
function originAllowed(origin, env = process.env) {
  if (!origin) return true;
  if (env.NODE_ENV !== "production") return true;
  const list = String(env.CORS_ORIGINS || "").split(",").map((s) => s.trim()).filter(Boolean);
  return list.includes(origin);
}

// Returns a function: call it for each event; false means "too many, drop this connection".
function createEventGuard({ max = 100, windowMs = 10000, now = () => Date.now() } = {}) {
  let stamps = [];
  return () => {
    const t = now();
    stamps = stamps.filter((s) => t - s < windowMs);
    stamps.push(t);
    return stamps.length <= max;
  };
}

module.exports = { authenticateSocket, originAllowed, createEventGuard, SocketAuthError };
