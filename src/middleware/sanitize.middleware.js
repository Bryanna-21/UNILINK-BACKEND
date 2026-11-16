"use strict";

// Refuses a request whose body or query carries database operators, such as {"userId": {"$ne": null}}.
// A real client never sends a key that starts with "$"; an attacker does, hoping it reaches a query. Rejecting
// them at the door protects every route at once, including ones written later. "__proto__", "constructor" and
// "prototype" keys are refused for the same reason. PURE check + a thin middleware (tests/sanitize.test.js).

const BAD_KEY = /^\$|^__proto__$|^constructor$|^prototype$/;
const MAX_DEPTH = 12;

function findBadKey(value, depth = 0, path = "") {
  if (value === null || typeof value !== "object") return null;
  if (depth > MAX_DEPTH) return path || "(too deeply nested)";
  if (Array.isArray(value)) {
    for (let i = 0; i < value.length; i += 1) {
      const hit = findBadKey(value[i], depth + 1, `${path}[${i}]`);
      if (hit) return hit;
    }
    return null;
  }
  for (const key of Object.keys(value)) {
    if (BAD_KEY.test(key)) return path ? `${path}.${key}` : key;
    const hit = findBadKey(value[key], depth + 1, path ? `${path}.${key}` : key);
    if (hit) return hit;
  }
  return null;
}

function rejectOperatorKeys(req, res, next) {
  const hit = findBadKey(req.body) || findBadKey(req.query);
  if (hit) {
    console.warn(`[security] refused ${req.method} ${req.path} from ${req.ip}: operator key "${hit}"`);
    return res.status(400).json({ status: "error", message: "Invalid request." });
  }
  return next();
}

module.exports = { rejectOperatorKeys, findBadKey };
