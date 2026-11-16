"use strict";

// Paging for the feed. A cursor is "<createdAt in milliseconds>_<post id>" of the LAST post a page returned; the
// next page is everything older. The id breaks ties between posts made in the same millisecond, so nothing is
// skipped or repeated. PURE (tests/feedCursor.test.js).

const isId = (x) => /^[a-f\d]{24}$/i.test(String(x));
const MAX_LIMIT = 50;
const DEFAULT_LIMIT = 50;

function encodeCursor(post) {
  const ms = new Date(post.createdAt).getTime();
  if (!Number.isFinite(ms) || !isId(post._id)) return null;
  return `${ms}_${String(post._id)}`;
}

// null: no cursor given. { error } : a cursor that cannot be read. { createdAt, id } : a good one.
function decodeCursor(raw) {
  if (raw === undefined || raw === null || raw === "") return null;
  const m = /^(\d{1,15})_([a-f\d]{24})$/i.exec(String(raw));
  if (!m) return { error: "That page marker is not valid." };
  return { createdAt: new Date(Number(m[1])), id: m[2] };
}

function parseLimit(raw) {
  const n = Number.parseInt(raw, 10);
  if (!Number.isFinite(n) || n < 1) return DEFAULT_LIMIT;
  return Math.min(n, MAX_LIMIT);
}

// The database condition for "older than the cursor". `toId` turns the id text into the id type the caller queries with.
function olderThan(cursor, toId = (x) => x) {
  return { $or: [{ createdAt: { $lt: cursor.createdAt } }, { createdAt: cursor.createdAt, _id: { $lt: toId(cursor.id) } }] };
}

module.exports = { encodeCursor, decodeCursor, parseLimit, olderThan, DEFAULT_LIMIT, MAX_LIMIT };
