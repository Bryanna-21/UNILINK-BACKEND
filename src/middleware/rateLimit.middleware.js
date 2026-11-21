"use strict";

// Limits how often one caller can hit sign-in routes. In-memory, per server process: enough for one Render
// instance (the free tier runs one); if you scale to several, move the counters to a shared store such as Redis.
// A caller is identified by IP (the server trusts one proxy hop, see app.js) and, where it matters, by the
// account being attacked, so one account cannot be hammered from many IPs either. (tests/rateLimit.test.js)

function createLimiter({ windowMs, max, now = () => Date.now() }) {
  const hits = new Map(); // key -> [timestamps within the window]

  function check(key) {
    const t = now();
    const recent = (hits.get(key) || []).filter((ts) => t - ts < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      return { ok: false, retryAfterMs: windowMs - (t - recent[0]) };
    }
    recent.push(t);
    hits.set(key, recent);
    return { ok: true, remaining: max - recent.length };
  }

  // Forget keys with nothing recent, so the map cannot grow forever.
  function sweep() {
    const t = now();
    for (const [key, list] of hits) {
      if (list.every((ts) => t - ts >= windowMs)) hits.delete(key);
    }
  }

  return { check, sweep, size: () => hits.size };
}

// Express middleware. `keys(req)` returns the keys to count this request against; all must pass.
function rateLimit({ name, windowMs, max, keys, message = "Too many attempts. Please wait a while and try again.", now }) {
  const limiter = createLimiter({ windowMs, max, now });
  const timer = setInterval(limiter.sweep, Math.max(windowMs, 60000));
  if (timer.unref) timer.unref();

  const middleware = (req, res, next) => {
    for (const key of keys(req)) {
      const result = limiter.check(`${name}:${key}`);
      if (!result.ok) {
        const seconds = Math.max(1, Math.ceil(result.retryAfterMs / 1000));
        res.set("Retry-After", String(seconds));
        console.warn(`[security] rate limit "${name}" hit by ${req.ip} on ${req.method} ${req.path}`);
        return res.status(429).json({ status: "error", code: "RATE_LIMITED", message, retryAfterSeconds: seconds });
      }
    }
    return next();
  };
  middleware.limiter = limiter;
  middleware.limitName = name;
  return middleware;
}

const MIN = 60 * 1000;
const HOUR = 60 * MIN;
const ip = (req) => req.ip || "unknown";
const textOf = (v) => (typeof v === "string" ? v.trim().toLowerCase().slice(0, 254) : "x");

// The presets the sign-in routes use (see routes/auth.routes.js).
//
// Two kinds of limit, on purpose:
//   TIGHT, per target: one account, or one address plus one account. This is what stops password and code
//     guessing, and it cannot lock out anyone but the person being attacked.
//   LOOSE, per address alone: a safety net against floods. Many students share one public address on a campus
//     network (and if the proxy setting were ever wrong, everyone would look like one address), so these are
//     high enough that normal use, such as a whole lecture hall signing in at the start of term, never hits them.
const authLimits = {
  // Password guessing: 10 per address+email, 300 per address in 15 minutes.
  login: rateLimit({ name: "login", windowMs: 15 * MIN, max: 10, keys: (req) => [`${ip(req)}|${textOf(req.body && req.body.email)}`], message: "Too many sign-in attempts for this account. Please wait 15 minutes and try again." }),
  loginFlood: rateLimit({ name: "loginFlood", windowMs: 15 * MIN, max: 300, keys: (req) => [`${ip(req)}`], message: "Too many sign-in attempts from this network. Please wait 15 minutes." }),
  // Code guessing: 10 per account (from anywhere), 200 per address. The code itself is also burned after 5 wrong tries.
  verifyCode: rateLimit({ name: "verify", windowMs: 15 * MIN, max: 10, keys: (req) => [`acct:${textOf(req.body && req.body.userId)}`], message: "Too many code attempts. Please wait 15 minutes and request a new code." }),
  verifyFlood: rateLimit({ name: "verifyFlood", windowMs: 15 * MIN, max: 200, keys: (req) => [`${ip(req)}`], message: "Too many code attempts from this network. Please wait 15 minutes." }),
  // Sending email: 3 per target in 15 minutes stops someone flooding a mailbox; 120 per address per hour stops
  // burning the email quota.
  sendCode: rateLimit({ name: "send", windowMs: 15 * MIN, max: 3, keys: (req) => [`${textOf(req.body && (req.body.email || req.body.userId))}`], message: "A code was sent recently. Please wait a few minutes before asking for another." }),
  sendCodeIp: rateLimit({ name: "sendIp", windowMs: HOUR, max: 120, keys: (req) => [`${ip(req)}`], message: "Too many requests from this network. Please try again later." }),
  register: rateLimit({ name: "register", windowMs: HOUR, max: 120, keys: (req) => [`${ip(req)}`], message: "Too many sign-ups from this network. Please try again later." }),
  // Reset: 8 per address+email, 200 per address.
  resetPassword: rateLimit({ name: "reset", windowMs: 15 * MIN, max: 8, keys: (req) => [`${ip(req)}|${textOf(req.body && req.body.email)}`], message: "Too many attempts. Please wait 15 minutes and request a new code." }),
  resetFlood: rateLimit({ name: "resetFlood", windowMs: 15 * MIN, max: 200, keys: (req) => [`${ip(req)}`], message: "Too many attempts from this network. Please wait 15 minutes." }),
  // Signed in already, so the person is the key.
  passwordChange: rateLimit({ name: "pwchange", windowMs: 15 * MIN, max: 8, keys: (req) => [`u:${req.user ? req.user.id : "x"}`], message: "Too many attempts. Please wait 15 minutes and try again." }),
};

// Limits on what a SIGNED-IN person can do, so one account cannot flood the app (or run up the SMS bill). The person
// is the key, so these run after the auth middleware. The numbers are well above normal use.
const user = (req) => `u:${req.user && (req.user.id || req.user._id) ? req.user.id || req.user._id : "x"}`;
const contentLimits = {
  createPost: rateLimit({ name: "createPost", windowMs: HOUR, max: 20, keys: (req) => [user(req)], message: "You are posting very quickly. Please wait a while before posting again." }),
  comment: rateLimit({ name: "comment", windowMs: 10 * MIN, max: 60, keys: (req) => [user(req)], message: "You are commenting very quickly. Please slow down for a few minutes." }),
  like: rateLimit({ name: "like", windowMs: 10 * MIN, max: 300, keys: (req) => [user(req)], message: "Too many likes in a short time. Please slow down." }),
  reshare: rateLimit({ name: "reshare", windowMs: HOUR, max: 30, keys: (req) => [user(req)], message: "You are resharing very quickly. Please wait a while." }),
  follow: rateLimit({ name: "follow", windowMs: HOUR, max: 120, keys: (req) => [user(req)], message: "You are following people very quickly. Please wait a while." }),
  message: rateLimit({ name: "message", windowMs: 5 * MIN, max: 120, keys: (req) => [user(req)], message: "You are sending messages very quickly. Please slow down for a few minutes." }),
  community: rateLimit({ name: "community", windowMs: HOUR, max: 30, keys: (req) => [user(req)], message: "You are creating things very quickly. Please wait a while." }),
  // An emergency alert must never be blocked by a limit that a real emergency could hit: 10 an hour is far above any
  // real use and only stops a script sending hundreds of texts at your expense.
  emergency: rateLimit({ name: "emergency", windowMs: HOUR, max: 10, keys: (req) => [user(req)], message: "Emergency alerts were sent several times in the last hour. If you are still in danger, call the emergency number directly." }),
};

module.exports = { createLimiter, rateLimit, authLimits, contentLimits };
