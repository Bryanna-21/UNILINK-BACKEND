"use strict";

// PURE planning for the starter posts (scripts/seedPosts.js). No database: the plan is built and checked here,
// so it is unit-tested (tests/seedPosts.test.js). The posts are written by ten clearly labelled UniLink accounts
// (see scripts/data/seedPosts.data.js), spread over the last 30 days so the feed does not look like it was all
// posted in one minute. The same input always gives the same plan, so a re-run changes nothing.

const usernameRules = require("./username.rules");

const DAY = 24 * 60 * 60 * 1000;
const MAX_TITLE = 60;
const MIN_CONTENT = 20;
const MAX_CONTENT = 280;

// A small fixed pseudo-random sequence: reproducible, no Math.random.
function sequence(seed) {
  let s = seed >>> 0;
  return () => {
    s = (Math.imul(s, 1664525) + 1013904223) >>> 0;
    return s / 4294967296;
  };
}

function buildSeedPlan({ channels, now = new Date(), days = 30 }) {
  const accounts = channels.map((c) => ({
    key: c.key,
    name: c.name,
    username: c.username,
    bio: c.bio,
    email: `seed-${c.key}@seed.unilink.invalid`,
  }));

  // Interleave the channels, so neighbouring posts come from different accounts.
  const longest = Math.max(...channels.map((c) => c.posts.length));
  const rows = [];
  for (let i = 0; i < longest; i += 1) {
    for (const c of channels) if (c.posts[i]) rows.push({ channelKey: c.key, seedKey: `${c.key}:${i + 1}`, title: c.posts[i][0], content: c.posts[i][1] });
  }

  const rand = sequence(20261114);
  const span = days * DAY;
  const posts = rows.map((row, i) => {
    // Oldest first: row 0 is the oldest, the last row the newest, each moved a little at random inside its slot.
    const slot = span / rows.length;
    const age = span - slot * i - rand() * slot * 0.9;
    return { ...row, createdAt: new Date(now.getTime() - Math.max(60 * 1000, age)) };
  });

  return { accounts, posts };
}

// Returns a list of problems; an empty list means the plan is safe to write.
function validatePlan(plan) {
  const problems = [];
  const seenContent = new Set();
  const seenKeys = new Set();
  const seenNames = new Set();
  for (const a of plan.accounts) {
    const u = usernameRules.validate(a.username);
    if (!u.ok) problems.push(`username ${a.username}: ${u.message || "not valid"}`);
    if (seenNames.has(a.username)) problems.push(`duplicate username ${a.username}`);
    seenNames.add(a.username);
    if (!a.bio || !/UniLink/i.test(a.bio)) problems.push(`${a.key}: the bio must say it is a UniLink account`);
  }
  const accountKeys = new Set(plan.accounts.map((a) => a.key));
  for (const p of plan.posts) {
    if (!accountKeys.has(p.channelKey)) problems.push(`${p.seedKey}: unknown account`);
    if (seenKeys.has(p.seedKey)) problems.push(`duplicate key ${p.seedKey}`);
    seenKeys.add(p.seedKey);
    const norm = p.content.trim().toLowerCase();
    if (seenContent.has(norm)) problems.push(`${p.seedKey}: duplicate text`);
    seenContent.add(norm);
    if (!p.title || p.title.length > MAX_TITLE) problems.push(`${p.seedKey}: title must be 1 to ${MAX_TITLE} characters`);
    if (p.content.length < MIN_CONTENT || p.content.length > MAX_CONTENT) problems.push(`${p.seedKey}: text must be ${MIN_CONTENT} to ${MAX_CONTENT} characters`);
    if (!(p.createdAt instanceof Date) || Number.isNaN(p.createdAt.getTime())) problems.push(`${p.seedKey}: bad date`);
  }
  return problems;
}

module.exports = { buildSeedPlan, validatePlan, MAX_TITLE, MIN_CONTENT, MAX_CONTENT, DAY };
