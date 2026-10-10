"use strict";

const MAX_LENGTH = 2000;

// Returns the cleaned text, or null if it is not an acceptable message.
function cleanMessageText(value) {
  if (typeof value !== "string") return null;
  const text = value.replace(/\r\n/g, "\n").trim();
  if (!text || text.length > MAX_LENGTH) return null;
  return text;
}

// Clamp a ?limit= query value to 1..100, default 50.
function clampLimit(value) {
  const n = parseInt(value, 10);
  if (!Number.isFinite(n)) return 50;
  return Math.min(Math.max(n, 1), 100);
}

module.exports = { cleanMessageText, clampLimit, MAX_LENGTH };
