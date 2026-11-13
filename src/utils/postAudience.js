"use strict";

// Who a post is FOR. PURE: no database, so every rule is unit-tested (tests/postAudience.test.js).
//
//   university   (the default, and what every older post is) - people at the author's university only
//   everyone     - anyone on UniLink
//   universities - people at the universities the author picked
//   followers    - people who follow the author
//   friends      - people who follow the author AND whom the author follows back
//   people       - exactly the people the author picked
//
// The author always sees their own post. Blocking and community membership are decided elsewhere
// (utils/postAccess.js); this file only answers "is this person in the chosen audience?".
// An audience value this code does not know is treated as closed, never open.

const AUDIENCES = ["everyone", "university", "universities", "followers", "friends", "people"];
const DEFAULT_AUDIENCE = "university";
const MAX_UNIVERSITIES = 50;
const MAX_PEOPLE = 100;

const isId = (x) => /^[a-f\d]{24}$/i.test(String(x));
const str = (x) => String(x);

// Accepts an array, a JSON array in a string, or a comma separated string (multipart forms send text).
function toList(raw) {
  if (raw === undefined || raw === null || raw === "") return [];
  if (Array.isArray(raw)) return raw.map(str);
  const text = String(raw).trim();
  if (!text) return [];
  if (text.startsWith("[")) {
    try {
      const parsed = JSON.parse(text);
      return Array.isArray(parsed) ? parsed.map(str) : [];
    } catch {
      return [];
    }
  }
  return text.split(",").map((s) => s.trim()).filter(Boolean);
}

const unique = (list) => [...new Set(list)];

// Turns what the client sent into what is stored, or says why it cannot be used.
function normalizeAudience(input = {}) {
  const raw = input.audience === undefined || input.audience === null || input.audience === "" ? DEFAULT_AUDIENCE : input.audience;
  const audience = typeof raw === "string" ? raw.trim().toLowerCase() : "";
  if (!AUDIENCES.includes(audience)) return { ok: false, message: "Choose who can see this post." };

  let audienceUniversityIds = [];
  let audienceUserIds = [];

  if (audience === "universities") {
    const ids = unique(toList(input.audienceUniversityIds));
    if (ids.some((id) => !isId(id))) return { ok: false, message: "One of the chosen universities is not valid." };
    if (ids.length === 0) return { ok: false, message: "Choose at least one university." };
    if (ids.length > MAX_UNIVERSITIES) return { ok: false, message: `You can choose up to ${MAX_UNIVERSITIES} universities.` };
    audienceUniversityIds = ids;
  }

  if (audience === "people") {
    const ids = unique(toList(input.audienceUserIds));
    if (ids.some((id) => !isId(id))) return { ok: false, message: "One of the chosen people is not valid." };
    if (ids.length === 0) return { ok: false, message: "Choose at least one person." };
    if (ids.length > MAX_PEOPLE) return { ok: false, message: `You can choose up to ${MAX_PEOPLE} people.` };
    audienceUserIds = ids;
  }

  return { ok: true, value: { audience, audienceUniversityIds, audienceUserIds } };
}

// Does this audience need to know who follows whom?
const needsFollowFacts = (post) => ["followers", "friends"].includes((post && post.audience) || DEFAULT_AUDIENCE);

// viewer: { id, universityId }. follows: { viewerFollowsAuthor, authorFollowsViewer } (only read when needed).
function audienceAllows({ post, viewer, follows = {} }) {
  const audience = post.audience || DEFAULT_AUDIENCE;
  switch (audience) {
    case "everyone":
      return true;
    case "university":
      return !!viewer.universityId && !!post.universityId && str(viewer.universityId) === str(post.universityId);
    case "universities":
      return !!viewer.universityId && (post.audienceUniversityIds || []).map(str).includes(str(viewer.universityId));
    case "followers":
      return !!follows.viewerFollowsAuthor;
    case "friends":
      return !!follows.viewerFollowsAuthor && !!follows.authorFollowsViewer;
    case "people":
      return (post.audienceUserIds || []).map(str).includes(str(viewer.id));
    default:
      return false;
  }
}

// The same rule as audienceAllows, written as a database filter for lists (the feed, liked posts...).
// followingIds: people the viewer follows. mutualIds: people the viewer follows who follow the viewer back.
// A viewer with no university simply has no "university" or "universities" branch.
function audienceFilter({ viewer, followingIds = [], mutualIds = [] }) {
  const me = str(viewer.id);
  const branches = [
    { userId: me },
    { audience: "everyone" },
    { audience: "followers", userId: { $in: followingIds.map(str) } },
    { audience: "friends", userId: { $in: mutualIds.map(str) } },
    { audience: "people", audienceUserIds: me },
  ];
  if (viewer.universityId) {
    const uni = str(viewer.universityId);
    // $in with null also matches a post that has no audience field at all: every post made before this existed.
    branches.push({ audience: { $in: [null, "university"] }, universityId: uni });
    branches.push({ audience: "universities", audienceUniversityIds: uni });
  }
  return { $or: branches };
}

// Reshares copy a post into other people's profiles, so only posts meant for a wide audience may be reshared.
const isReshareable = (post) => ["everyone", "university"].includes((post && post.audience) || DEFAULT_AUDIENCE);

module.exports = {
  AUDIENCES,
  DEFAULT_AUDIENCE,
  MAX_UNIVERSITIES,
  MAX_PEOPLE,
  normalizeAudience,
  needsFollowFacts,
  audienceAllows,
  audienceFilter,
  isReshareable,
};
