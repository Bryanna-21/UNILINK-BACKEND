"use strict";

// Who may see a post or a person. PURE: no database, so every rule is unit-tested
// (tests/postAccess.test.js). The loading of the facts it needs lives in services/postAccess.service.js.
//
// The rules, in order:
//   - a superadmin, or an admin with no university (a platform admin), is never refused: they moderate
//   - the owner can always see their own post
//   - someone blocked either way with the author cannot see the post, as if it did not exist
//   - a community post is visible only to an active member of that community (the same rule the community
//     feed uses). Communities can connect universities, so the post's own university is NOT used here.
//   - any other post follows the audience its author chose (utils/postAudience.js): everyone, their own
//     university (the default, and what every older post is), chosen universities, followers, friends or
//     chosen people
//
// Every refusal looks like "not found", never "forbidden", so nobody can probe which ids exist.

const { audienceAllows } = require("./postAudience");

const isPlatformModerator = (v) => v.role === "superadmin" || (v.role === "admin" && !v.universityId);

// follows: { viewerFollowsAuthor, authorFollowsViewer }, only needed for followers / friends posts.
function decidePostAccess({ viewer, post, communityAccess, blocked, follows }) {
  if (!viewer || viewer.deletedAt) return { ok: false, reason: "no_viewer" };
  if (!post) return { ok: false, reason: "no_post" };
  if (isPlatformModerator(viewer)) return { ok: true };
  if (String(post.userId) === String(viewer.id)) return { ok: true };
  if (blocked) return { ok: false, reason: "blocked" };
  if (post.communityId) return communityAccess ? { ok: true } : { ok: false, reason: "not_a_member" };
  if (audienceAllows({ post, viewer, follows })) return { ok: true };
  return { ok: false, reason: (post.audience || "university") === "university" ? "other_university" : "not_in_audience" };
}

// Whether `viewer` may look at `target`'s profile details. People are visible across universities (following
// is universal); blocking still applies. `scopeUniversity: true` keeps the old same-university-only rule for
// any caller that still wants it.
function decideUserAccess({ viewer, target, blocked, scopeUniversity = false }) {
  if (!viewer || viewer.deletedAt) return { ok: false, reason: "no_viewer" };
  if (!target || target.deletedAt) return { ok: false, reason: "no_user" };
  if (isPlatformModerator(viewer)) return { ok: true };
  if (String(target.id) === String(viewer.id)) return { ok: true };
  if (blocked) return { ok: false, reason: "blocked" };
  if (scopeUniversity && (!viewer.universityId || String(viewer.universityId) !== String(target.universityId))) {
    return { ok: false, reason: "other_university" };
  }
  return { ok: true };
}

module.exports = { decidePostAccess, decideUserAccess, isPlatformModerator };
