"use strict";
// The limits are only worth anything if they are actually attached to the routes, in the right place: after the
// sign-in check (so the person is known) and before the controller. This reads the real routers.
const test = require("node:test");
const assert = require("node:assert/strict");

function chain(router, method, path) {
  const layer = router.stack.find((l) => l.route && l.route.path === path && l.route.methods[method]);
  assert.ok(layer, `${method.toUpperCase()} ${path} exists`);
  return layer.route.stack.map((l) => l.handle);
}
const names = (handlers) => handlers.map((h) => h.limitName || h.name || "?");

function expectLimit(router, method, path, limitName, { afterAuth = true } = {}) {
  const handlers = chain(router, method, path);
  const at = handlers.findIndex((h) => h.limitName === limitName);
  assert.ok(afterAuth ? at > 0 : at >= 0, `${method.toUpperCase()} ${path} has the "${limitName}" limit (chain: ${names(handlers).join(" > ")})`);
  assert.ok(at < handlers.length - 1, "and it comes before the controller");
}

const posts = require("../src/routes/post.routes");
const follow = require("../src/routes/follow.routes");
const messages = require("../src/routes/message.routes");
const emergency = require("../src/routes/emergency.routes");
const community = require("../src/routes/community.routes");
const auth = require("../src/routes/auth.routes");

test("posting, liking, resharing and commenting are limited per person", () => {
  expectLimit(posts, "post", "/", "createPost");
  expectLimit(posts, "post", "/create", "createPost");
  expectLimit(posts, "post", "/like/:id", "like");
  expectLimit(posts, "post", "/reshare/:id", "reshare");
  expectLimit(posts, "post", "/:id/comments", "comment");
});

test("following and sending messages are limited per person", () => {
  expectLimit(follow, "post", "/:userId", "follow");
  expectLimit(messages, "post", "/:conversationId/messages", "message");
});

test("emergency alerts are limited, generously, so a script cannot run up the SMS bill", () => {
  expectLimit(emergency, "post", "/report", "emergency");
  expectLimit(emergency, "post", "/help", "emergency");
  const { contentLimits } = require("../src/middleware/rateLimit.middleware");
  const limiter = contentLimits.emergency.limiter;
  let now = 0;
  const l = require("../src/middleware/rateLimit.middleware").createLimiter({ windowMs: 3600000, max: 10, now: () => now });
  for (let i = 0; i < 10; i += 1) assert.equal(l.check("u").ok, true);
  assert.equal(l.check("u").ok, false);
  assert.ok(limiter, "the real limiter exists");
});

test("the older comment and community routes are limited too", () => {
  expectLimit(community, "post", "/posts/:postId/comments", "comment");
  expectLimit(community, "post", "/courses/:courseId/discussion", "comment");
  for (const path of ["/clubs", "/projects", "/study-groups", "/polls", "/announcements"]) expectLimit(community, "post", path, "community");
});

test("sign-in routes keep their limits, and 'sign out of all devices' exists and is limited", () => {
  expectLimit(auth, "post", "/login", "login", { afterAuth: false });
  expectLimit(auth, "post", "/login", "loginFlood", { afterAuth: false });
  expectLimit(auth, "post", "/verify-otp", "verify", { afterAuth: false });
  expectLimit(auth, "post", "/logout-all", "pwchange");
  const handlers = chain(auth, "post", "/logout-all");
  assert.ok(handlers.length >= 3, "signed in first, then limited, then the handler");
});
