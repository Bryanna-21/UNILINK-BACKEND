"use strict";

// Writes (and removes) the starter posts. The models are injected, so this is unit-tested without a
// database (tests/seedPosts.test.js). Every account and post it makes is flagged isSeed, and every post has a
// seedKey, so running it twice creates nothing new and one command removes all of it.
//
// The accounts are labelled UniLink accounts, post for everyone, and have a password nobody knows, so nobody
// can sign in as them. They carry no likes, comments or followers of their own: nothing is faked.

const crypto = require("crypto");

async function planSeed({ User, Post }, plan) {
  const existingUsers = await User.find({ isSeed: true }).select("username").lean();
  const haveUsers = new Set(existingUsers.map((u) => u.username));
  const existingPosts = await Post.find({ isSeed: true }).select("seedKey").lean();
  const havePosts = new Set(existingPosts.map((p) => p.seedKey));
  return {
    accountsToCreate: plan.accounts.filter((a) => !haveUsers.has(a.username)),
    postsToCreate: plan.posts.filter((p) => !havePosts.has(p.seedKey)),
    accountsPresent: plan.accounts.length - plan.accounts.filter((a) => !haveUsers.has(a.username)).length,
    postsPresent: plan.posts.length - plan.posts.filter((p) => !havePosts.has(p.seedKey)).length,
  };
}

async function applySeed({ User, Post, hashPassword }, plan, { universityId = null } = {}) {
  const todo = await planSeed({ User, Post }, plan);
  const taken = await User.find({ username: { $in: todo.accountsToCreate.map((a) => a.username) } }).select("username isSeed").lean();
  const clash = taken.filter((u) => !u.isSeed);
  if (clash.length) throw new Error(`These usernames already belong to real accounts: ${clash.map((u) => u.username).join(", ")}`);

  for (const a of todo.accountsToCreate) {
    const password = await hashPassword(crypto.randomBytes(24).toString("hex"));
    await User.create({
      name: a.name,
      email: a.email,
      password,
      username: a.username,
      bio: a.bio,
      role: "student",
      status: "active",
      universityId: universityId ? String(universityId) : undefined,
      onboardingCompletedAt: new Date(),
      isSeed: true,
    });
  }

  const users = await User.find({ isSeed: true }).select("_id username").lean();
  const idByUsername = new Map(users.map((u) => [u.username, String(u._id)]));
  const accountByKey = new Map(plan.accounts.map((a) => [a.key, a]));

  const docs = todo.postsToCreate.map((p) => ({
    userId: idByUsername.get(accountByKey.get(p.channelKey).username),
    universityId: universityId ? String(universityId) : null,
    title: p.title,
    content: p.content,
    media: [],
    audience: "everyone",
    audienceUniversityIds: [],
    audienceUserIds: [],
    isSeed: true,
    seedKey: p.seedKey,
    createdAt: p.createdAt,
  }));
  if (docs.length) await Post.insertMany(docs);
  return { accountsCreated: todo.accountsToCreate.length, postsCreated: docs.length };
}

async function removeSeed({ User, Post, Comment, Like, HiddenPost, UserNotification, Follow }) {
  const posts = await Post.find({ isSeed: true }).select("_id").lean();
  const postIds = posts.map((p) => String(p._id));
  const users = await User.find({ isSeed: true }).select("_id").lean();
  const userIds = users.map((u) => String(u._id));

  let comments = 0;
  let likes = 0;
  if (postIds.length) {
    comments = (await Comment.deleteMany({ postId: { $in: postIds } })).deletedCount || 0;
    likes = (await Like.deleteMany({ postId: { $in: postIds } })).deletedCount || 0;
    await HiddenPost.deleteMany({ postId: { $in: postIds } });
    await UserNotification.deleteMany({ postId: { $in: postIds } });
    // Reshares of a seed post go with it.
    await Post.deleteMany({ reshareOf: { $in: postIds } });
  }
  const removedPosts = (await Post.deleteMany({ isSeed: true })).deletedCount || 0;
  if (userIds.length) {
    await Follow.deleteMany({ $or: [{ followerId: { $in: userIds } }, { followingId: { $in: userIds } }] });
    await UserNotification.deleteMany({ $or: [{ actorId: { $in: userIds } }, { recipientId: { $in: userIds } }] });
  }
  const removedUsers = (await User.deleteMany({ isSeed: true })).deletedCount || 0;
  return { posts: removedPosts, accounts: removedUsers, comments, likes };
}

module.exports = { planSeed, applySeed, removeSeed };
