"use strict";

// Pure rules for the notification list (no database, unit-tested). The list is grouped the way
// Instagram groups it, with Academic updates kept apart:
//
//   all        everything below
//   followers  someone followed you
//   activity   likes and comments on your posts
//   mentions   someone @mentioned you in a post or a comment
//   updates    grades, assignments, exams, announcements, timetable, opportunities, moderation
//
// Message notifications are NOT in the list at all: new messages show on the Messages screen
// (unread counts), and still reach the phone as a push.

const CATEGORY_TYPES = {
  followers: ["new_follower"],
  activity: ["post_like", "post_comment"],
  mentions: ["mention"],
  updates: [
    "grade_posted",
    "new_assignment",
    "exam_published",
    "announcement",
    "timetable",
    "opportunity",
    "schedule_change",
    "moderation",
  ],
};

const HIDDEN_TYPES = ["new_message"];
const CATEGORIES = ["all", ...Object.keys(CATEGORY_TYPES)];

function normalizeCategory(raw) {
  const value = String(raw || "").trim().toLowerCase();
  return CATEGORIES.includes(value) ? value : "all";
}

// The `type` part of a database filter for one tab. Never lets a message notification through.
function typeFilter(category) {
  const c = normalizeCategory(category);
  return c === "all" ? { $nin: HIDDEN_TYPES } : { $in: CATEGORY_TYPES[c] };
}

// Which tab a notification type belongs to. Messages belong to none.
function categoryOf(type) {
  if (HIDDEN_TYPES.includes(type)) return null;
  for (const [category, types] of Object.entries(CATEGORY_TYPES)) {
    if (types.includes(type)) return category;
  }
  return "updates"; // a type added later still shows, under Updates
}

// [{ _id: "post_like", n: 3 }, ...] (unread rows grouped by type) -> unread count per tab.
function countsByCategory(rows) {
  const counts = { all: 0, followers: 0, activity: 0, mentions: 0, updates: 0 };
  for (const row of rows || []) {
    const category = categoryOf(row._id);
    if (!category) continue;
    const n = Number(row.n) || 0;
    counts[category] += n;
    counts.all += n;
  }
  return counts;
}

// @names in a piece of text, lowercased, no repeats, at most 10 (one post must not be able to
// notify a whole university). An email address is not a mention, and a full stop after a name
// ("thanks @amina.") is not part of it. Usernames are 3 to 20 characters.
function extractMentions(text) {
  const found = [];
  const pattern = /(^|[^a-z0-9_.@])@([a-z0-9][a-z0-9_.]{2,19})/gi;
  let match;
  while ((match = pattern.exec(String(text || ""))) !== null) {
    const name = match[2].replace(/\.+$/, "").toLowerCase();
    if (name.length >= 3 && !found.includes(name)) found.push(name);
    if (found.length >= 10) break;
  }
  return found;
}

function snippet(text, max = 80) {
  const clean = String(text || "").replace(/\s+/g, " ").trim();
  return clean.length > max ? `${clean.slice(0, max)}...` : clean;
}

module.exports = {
  CATEGORIES,
  CATEGORY_TYPES,
  HIDDEN_TYPES,
  normalizeCategory,
  typeFilter,
  categoryOf,
  countsByCategory,
  extractMentions,
  snippet,
};
