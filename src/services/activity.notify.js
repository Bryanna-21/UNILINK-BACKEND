"use strict";

// Creates the Instagram-style notifications: someone followed you, liked or commented on your
// post, or @mentioned you. Dependencies are injected so the rules are unit-tested without a
// database; the bottom of the file wires the real ones.
//
// Rules, in one place:
//   - never notify yourself;
//   - never notify across a block (either direction);
//   - a follow, and a like on a given post, notify once however often they are repeated
//     (unfollow and follow again, or unlike and like again, must not nag);
//   - a mention only reaches people at the same university who are allowed to see the post;
//   - nothing here can fail the action that caused it: every error is swallowed and logged.
const { extractMentions, snippet } = require("../utils/notification.rules");

function createActivityNotifier({ User, canViewPost, isBlockedEitherWay, notify, log = console }) {
  const idOf = (value) => (value === undefined || value === null ? "" : String(value));

  async function actorName(actorId) {
    const user = await User.findById(actorId).select("name username").lean();
    return (user && (user.name || user.username)) || "Someone";
  }

  // Drops the actor and anyone blocked either way, and repeats.
  async function allowedRecipients(actorId, recipientIds) {
    const out = [];
    for (const raw of new Set(recipientIds.map(idOf).filter(Boolean))) {
      if (raw === idOf(actorId)) continue;
      if (await isBlockedEitherWay(actorId, raw)) continue;
      out.push(raw);
    }
    return out;
  }

  async function send({ actorId, recipientIds, type, title, message, link, postId, dedupe }) {
    const recipients = await allowedRecipients(actorId, recipientIds);
    if (recipients.length === 0) return 0;
    await notify({
      recipientIds: recipients,
      type,
      title,
      message,
      link,
      actorId: idOf(actorId),
      postId: postId ? idOf(postId) : null,
      dedupe: !!dedupe,
    });
    return recipients.length;
  }

  // Resolves @names to people who may be told: same university as the post, not deleted, and
  // allowed to see the post (a community post only reaches members).
  async function mentionTargets(text, post, skipIds) {
    const names = extractMentions(text);
    if (names.length === 0) return [];
    const filter = { username: { $in: names }, deletedAt: null };
    if (post.universityId) filter.universityId = post.universityId;
    const users = await User.find(filter).select("_id").lean();
    const out = [];
    for (const u of users) {
      const id = idOf(u._id);
      if (skipIds.includes(id)) continue;
      if (canViewPost && !(await canViewPost(id, post))) continue;
      out.push(id);
    }
    return out;
  }

  async function guarded(label, work) {
    try {
      return await work();
    } catch (error) {
      log.error(`✗ Activity notification (${label}) failed:`, error && error.message);
      return 0;
    }
  }

  return {
    // followerId started following followingId.
    notifyFollow: ({ followerId, followingId }) =>
      guarded("follow", async () => {
        const name = await actorName(followerId);
        return send({
          actorId: followerId,
          recipientIds: [followingId],
          type: "new_follower",
          title: `${name} started following you`,
          link: `/user/${idOf(followerId)}`,
          dedupe: true,
        });
      }),

    // actorId liked `post`. Only a like creates this; unliking does not.
    notifyLike: ({ actorId, post }) =>
      guarded("like", async () => {
        const name = await actorName(actorId);
        return send({
          actorId,
          recipientIds: [post.userId],
          type: "post_like",
          title: `${name} liked your post`,
          message: snippet(post.title || post.content),
          link: `/post/${idOf(post._id)}`,
          postId: post._id,
          dedupe: true,
        });
      }),

    // actorId commented on `post`. The owner hears about the comment, unless they are also
    // @mentioned in it (then they get the mention, not two alerts for one comment).
    notifyComment: ({ actorId, post, comment }) =>
      guarded("comment", async () => {
        const name = await actorName(actorId);
        const mentioned = await mentionTargets(comment.content, post, [idOf(actorId)]);
        const link = `/post/${idOf(post._id)}`;
        let sent = 0;

        if (!mentioned.includes(idOf(post.userId))) {
          sent += await send({
            actorId,
            recipientIds: [post.userId],
            type: "post_comment",
            title: `${name} commented on your post`,
            message: snippet(comment.content),
            link,
            postId: post._id,
          });
        }
        if (mentioned.length > 0) {
          sent += await send({
            actorId,
            recipientIds: mentioned,
            type: "mention",
            title: `${name} mentioned you in a comment`,
            message: snippet(comment.content),
            link,
            postId: post._id,
          });
        }
        return sent;
      }),

    // actorId wrote `post`, which may @mention people.
    notifyPostMentions: ({ actorId, post }) =>
      guarded("post mention", async () => {
        const text = `${post.title || ""} ${post.content || ""}`;
        const mentioned = await mentionTargets(text, post, [idOf(actorId)]);
        if (mentioned.length === 0) return 0;
        const name = await actorName(actorId);
        return send({
          actorId,
          recipientIds: mentioned,
          type: "mention",
          title: `${name} mentioned you in a post`,
          message: snippet(post.title || post.content),
          link: `/post/${idOf(post._id)}`,
          postId: post._id,
          dedupe: true,
        });
      }),
  };
}

let instance = null;
// Created on first use so requiring this file never touches the models in tests.
function real() {
  if (!instance) {
    const postAccess = require("./postAccess.service");
    instance = createActivityNotifier({
      User: require("../models/User"),
      canViewPost: postAccess.canViewPost,
      isBlockedEitherWay: postAccess.isBlockedEitherWay,
      notify: require("../middleware/notifyUsers.middleware"),
    });
  }
  return instance;
}

module.exports = {
  createActivityNotifier,
  notifyFollow: (...a) => real().notifyFollow(...a),
  notifyLike: (...a) => real().notifyLike(...a),
  notifyComment: (...a) => real().notifyComment(...a),
  notifyPostMentions: (...a) => real().notifyPostMentions(...a),
};
