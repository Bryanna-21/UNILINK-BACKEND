"use strict";

// What goes with a post when it is deleted, or when its audience narrows. Models are injected, so it is
// unit-tested without a database (tests/postCleanup.test.js). Before this, deleting a post left its comments,
// likes, hidden-post rows, reshares and notifications behind as orphans.
// Every step is best-effort and independent: one failing never stops the others, and none throws.

async function safely(log, label, fn) {
  try {
    return await fn();
  } catch (err) {
    log.error(`[post cleanup] ${label}: ${err && err.message}`);
    return null;
  }
}

async function removePostLeftovers({ Post, Comment, Like, HiddenPost, UserNotification }, postId, log = console) {
  const id = String(postId);
  const reshares = (await safely(log, "find reshares", () => Post.find({ reshareOf: id }).select("_id").lean())) || [];
  const ids = [id, ...reshares.map((r) => String(r._id))];

  await safely(log, "comments", () => Comment.deleteMany({ postId: { $in: ids } }));
  await safely(log, "likes", () => Like.deleteMany({ postId: { $in: ids } }));
  await safely(log, "hidden", () => HiddenPost.deleteMany({ postId: { $in: ids } }));
  await safely(log, "notifications", () => UserNotification.deleteMany({ postId: { $in: ids } }));
  if (reshares.length) await safely(log, "reshares", () => Post.deleteMany({ reshareOf: id }));
  return { reshares: reshares.length };
}

// When a post's audience changes, copies of it made by resharing must not keep showing it to people the new
// audience does not include. everyone: all reshares stay. university: reshares by people outside the author's
// university go. Every other audience: all reshares go.
async function trimResharesForAudience({ Post, Comment, Like, HiddenPost, UserNotification }, post, newAudience, log = console) {
  if (newAudience === "everyone") return { removed: 0 };
  const filter = { reshareOf: String(post._id) };
  if (newAudience === "university") filter.universityId = { $ne: post.universityId || null };
  const doomed = (await safely(log, "find reshares", () => Post.find(filter).select("_id").lean())) || [];
  if (!doomed.length) return { removed: 0 };
  const ids = doomed.map((d) => String(d._id));
  await safely(log, "comments", () => Comment.deleteMany({ postId: { $in: ids } }));
  await safely(log, "likes", () => Like.deleteMany({ postId: { $in: ids } }));
  await safely(log, "hidden", () => HiddenPost.deleteMany({ postId: { $in: ids } }));
  await safely(log, "notifications", () => UserNotification.deleteMany({ postId: { $in: ids } }));
  await safely(log, "reshares", () => Post.deleteMany({ _id: { $in: ids } }));
  return { removed: ids.length };
}

module.exports = { removePostLeftovers, trimResharesForAudience };
