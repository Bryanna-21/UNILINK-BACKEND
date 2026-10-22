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
//   - any other post is visible only inside the viewer's own university
//
// Every refusal looks like "not found", never "forbidden", so nobody can probe which ids exist.

const isPlatformModerator = (v) => v.role === "superadmin" || (v.role === "admin" && !v.universityId);

function decidePostAccess({ viewer, post, communityAccess, blocked }) {
  if (!viewer || viewer.deletedAt) return { ok: false, reason: "no_viewer" };
  if (!post) return { ok: false, reason: "no_post" };
  if (isPlatformModerator(viewer)) return { ok: true };
  if (String(post.userId) === String(viewer.id)) return { ok: true };
  if (blocked) return { ok: false, reason: "blocked" };
  if (post.communityId) return communityAccess ? { ok: true } : { ok: false, reason: "not_a_member" };
  if (!viewer.universityId || !post.universityId || String(viewer.universityId) !== String(post.universityId)) {
    return { ok: false, reason: "other_university" };
  }
  return { ok: true };
}

// Whether `viewer` may look at `target`'s profile details. `scopeUniversity` is false for lookups that
// are open to the whole platform by design (the name and photo lookup used by Messages); blocking
// still applies to those.
function decideUserAccess({ viewer, target, blocked, scopeUniversity = true }) {
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
