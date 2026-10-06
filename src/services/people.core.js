"use strict";

// All people-related logic: username search, suggestions, username changes, blocking.
// No mongoose in this file. Database access goes through `repo` (see people.repo.js),
// which lets the whole decision layer run under `npm test` with an in-memory repo.

const rules = require("../utils/username.rules");

const ok = (data) => ({ ok: true, data });
const fail = (status, message) => ({ ok: false, status, message });

function createLimiter({ max, windowMs, now }) {
  const hits = new Map();
  return function allow(key) {
    const t = now();
    const recent = (hits.get(key) || []).filter((x) => t - x < windowMs);
    if (recent.length >= max) {
      hits.set(key, recent);
      return false;
    }
    recent.push(t);
    hits.set(key, recent);
    if (hits.size > 5000) {
      for (const [k, v] of hits) if (!v.some((x) => t - x < windowMs)) hits.delete(k);
    }
    return true;
  };
}

const shape = (u) => ({
  _id: String(u._id),
  name: u.name,
  username: u.username || null,
  avatarUrl: u.avatarUrl || null,
  role: u.role,
});

function createPeopleCore({ repo, now = () => new Date(), random = Math.random, config = {} }) {
  const cfg = {
    searchPerMinute: 30,
    checkPerMinute: 20,
    blockPerMinute: 30,
    changeCooldownDays: 14,
    searchLimit: 20,
    suggestionLimit: 15,
    paddingThreshold: 8,
    ...config,
  };
  const clock = () => now().getTime();
  const searchLimiter = createLimiter({ max: cfg.searchPerMinute, windowMs: 60000, now: clock });
  const checkLimiter = createLimiter({ max: cfg.checkPerMinute, windowMs: 60000, now: clock });
  const blockLimiter = createLimiter({ max: cfg.blockPerMinute, windowMs: 60000, now: clock });

  async function viewerOrNull(viewerId) {
    const me = await repo.userById(viewerId);
    return me && !me.deletedAt ? me : null;
  }

  // Sets a username, first releasing it from a deleted account that still holds it.
  async function claim(username, userId, changedAt) {
    const holder = await repo.userByUsername(username);
    if (holder && String(holder._id) !== String(userId)) {
      if (!holder.deletedAt) return false;
      await repo.releaseUsername(holder._id);
    }
    return repo.claimUsername(userId, username, changedAt);
  }

  // ---- Search ---------------------------------------------------------------
  async function search(viewerId, rawQuery) {
    if (!searchLimiter(String(viewerId))) return fail(429, "Too many searches. Please wait a moment.");
    const term = rules.searchTerm(rawQuery);
    if (!term.ok) return ok([]);

    const me = await viewerOrNull(viewerId);
    if (!me) return fail(401, "Account not available.");
    const isSuper = me.role === "superadmin";
    if (!isSuper && !me.universityId) return ok([]);

    const blocked = await repo.blockedIdsFor(me._id);
    const found = await repo.searchUsersByUsernamePrefix({
      prefix: term.value,
      universityId: isSuper ? null : String(me.universityId),
      excludeIds: [String(me._id), ...blocked.map(String)],
      limit: cfg.searchLimit,
    });

    found.sort(
      (a, b) =>
        Number(b.username === term.value) - Number(a.username === term.value) ||
        String(a.username).localeCompare(String(b.username))
    );

    const followed = await repo.followedAmong(me._id, found.map((u) => String(u._id)));
    return ok(found.map((u) => ({ ...shape(u), isFollowing: followed.has(String(u._id)) })));
  }

  // ---- Suggestions ----------------------------------------------------------
  async function suggest(viewerId) {
    const me = await viewerOrNull(viewerId);
    if (!me) return fail(401, "Account not available.");
    if (!me.universityId) return ok([]);

    const myId = String(me._id);
    const [blocked, following] = await Promise.all([
      repo.blockedIdsFor(myId),
      repo.followingIds(myId, 500),
    ]);
    const excluded = new Set([myId, ...blocked.map(String), ...following.map(String)]);

    const scores = new Map();
    const bump = (id, points, kind) => {
      const entry = scores.get(id) || { score: 0, course: false, mutual: 0 };
      entry.score += points;
      if (kind === "course") entry.course = true;
      if (kind === "mutual") entry.mutual += 1;
      scores.set(id, entry);
    };

    // Classmates are the strongest signal; each shared course adds to the score.
    const courses = await repo.coursesOf(myId);
    for (const course of courses) {
      for (const id of (course.enrolledStudentIds || []).slice(0, 300)) {
        const key = String(id);
        if (!excluded.has(key)) bump(key, 3, "course");
      }
    }

    // Friends of friends: people the people I follow already follow.
    if (following.length) {
      const rows = await repo.followingOfMany(following.slice(0, 100).map(String), 2000);
      for (const row of rows) {
        const key = String(row.followingId);
        if (!excluded.has(key)) bump(key, 2, "mutual");
      }
    }

    const ranked = [...scores.entries()]
      .sort((a, b) => b[1].score - a[1].score || (a[0] < b[0] ? -1 : 1))
      .slice(0, cfg.suggestionLimit * 3)
      .map(([id]) => id);

    const users = ranked.length ? await repo.usersByIds(ranked) : [];
    const byId = new Map(users.map((u) => [String(u._id), u]));

    const out = [];
    for (const id of ranked) {
      const u = byId.get(id);
      if (!u || String(u.universityId) !== String(me.universityId)) continue;
      const s = scores.get(id);
      const reason = s.course
        ? "In your course"
        : s.mutual > 1
        ? `Followed by ${s.mutual} people you follow`
        : "Followed by someone you follow";
      out.push({ ...shape(u), reason });
      if (out.length >= cfg.suggestionLimit) break;
    }

    // A brand-new account has no courses and no follows. Rather than an empty screen,
    // pad with the newest people at the same university.
    if (out.length < cfg.paddingThreshold) {
      const taken = new Set([...excluded, ...out.map((o) => o._id)]);
      const recent = await repo.recentUsers({
        universityId: String(me.universityId),
        excludeIds: [...taken],
        limit: cfg.suggestionLimit - out.length,
      });
      for (const u of recent) out.push({ ...shape(u), reason: "New at your university" });
    }
    return ok(out);
  }

  // ---- Usernames ------------------------------------------------------------
  async function checkUsername(viewerId, raw) {
    if (!checkLimiter(String(viewerId))) return fail(429, "Too many checks. Please wait a moment.");
    const v = rules.validate(raw);
    if (!v.ok) return ok({ available: false, reason: v.message });
    const holder = await repo.userByUsername(v.value);
    if (!holder || holder.deletedAt) return ok({ available: true });
    if (String(holder._id) === String(viewerId)) return ok({ available: true, own: true });
    return ok({ available: false, reason: "That username is taken." });
  }

  async function changeUsername(viewerId, raw) {
    const v = rules.validate(raw);
    if (!v.ok) return fail(400, v.message);
    const me = await viewerOrNull(viewerId);
    if (!me) return fail(401, "Account not available.");

    if (me.username === v.value) return ok({ username: v.value });

    // The first choice is free (a generated username was never chosen).
    // After that, one change per cooldown window, so a name can't be swapped to dodge reports.
    if (me.username && me.usernameChangedAt) {
      const next = new Date(new Date(me.usernameChangedAt).getTime() + cfg.changeCooldownDays * 86400000);
      if (now() < next) {
        return fail(400, `You can change your username again on ${next.toISOString().slice(0, 10)}.`);
      }
    }

    const claimed = await claim(v.value, me._id, now());
    if (!claimed) return fail(409, "That username is taken.");
    return ok({ username: v.value });
  }

  // Used by registration. A username the user typed must be valid and free (else a clear
  // 400). When none is given one is generated, and a failure there never blocks signup:
  // the backfill script can assign it later.
  async function resolveSignupUsername({ requested, name, email }) {
    if (requested !== undefined && requested !== null && String(requested).trim() !== "") {
      const v = rules.validate(requested);
      if (!v.ok) return { ok: false, message: v.message };
      const holder = await repo.userByUsername(v.value);
      if (holder && !holder.deletedAt) return { ok: false, message: "That username is taken." };
      if (holder && holder.deletedAt) await repo.releaseUsername(holder._id);
      return { ok: true, fields: { username: v.value } };
    }
    try {
      const username = await rules.generateUsername({
        name,
        email,
        random,
        isTaken: async (u) => !!(await repo.userByUsername(u)),
      });
      return { ok: true, fields: { username } };
    } catch (err) {
      console.error("Username generation failed, registering without one:", err.message);
      return { ok: true, fields: {} };
    }
  }

  // ---- Blocking -------------------------------------------------------------
  async function block(viewerId, targetId) {
    if (!blockLimiter(String(viewerId))) return fail(429, "Too many requests. Please wait a moment.");
    if (String(viewerId) === String(targetId)) return fail(400, "You can't block yourself.");
    const target = await repo.userById(targetId);
    if (!target || target.deletedAt) return fail(404, "User not found.");
    await repo.addBlock(String(viewerId), String(target._id));
    await repo.removeFollowsBetween(String(viewerId), String(target._id));
    return ok({ blocked: true });
  }

  async function unblock(viewerId, targetId) {
    if (!blockLimiter(String(viewerId))) return fail(429, "Too many requests. Please wait a moment.");
    await repo.removeBlock(String(viewerId), String(targetId));
    return ok({ blocked: false });
  }

  async function listBlocks(viewerId) {
    const rows = await repo.listBlocks(String(viewerId));
    if (!rows.length) return ok([]);
    const users = await repo.usersByIds(rows.map((r) => String(r.blockedId)));
    const byId = new Map(users.map((u) => [String(u._id), u]));
    return ok(rows.map((r) => byId.get(String(r.blockedId))).filter(Boolean).map(shape));
  }

  const eitherBlocked = (a, b) => repo.isBlockedEitherWay(String(a), String(b));

  return { search, suggest, checkUsername, changeUsername, resolveSignupUsername, block, unblock, listBlocks, eitherBlocked };
}

module.exports = { createPeopleCore, createLimiter };
