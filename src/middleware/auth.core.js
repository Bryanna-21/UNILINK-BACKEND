"use strict";

// The authentication check, with its dependencies injected so the exact code that guards
// every request is unit-tested (tests/auth.core.test.js). auth.middleware.js wires in the
// real jsonwebtoken and User model.
//
// What changed from the old middleware: it used to check only the token and tokenVersion.
// "Suspended" was just a label that nothing ever read, so a suspended user kept full access.
// Now the account's standing is checked on EVERY request, using the same user lookup the
// middleware already did (it just selects a few more fields: no extra query).
//
//   authenticate               blocks suspended / terminated / deleted accounts (403, with a code)
//   authenticate.allowRestricted  lets a suspended or terminated account through, for the
//                              few routes it must still reach: seeing its standing and appealing.
//
// Kill switch: set MODERATION_ENFORCE_STATUS=false to stop enforcing standing without
// redeploying code (e.g. if existing "suspended" accounts need reviewing first).

const { accountBlock, activeRestrictions } = require("../utils/moderation.rules");

function createAuth({ jwt, User, now = () => new Date(), enforce = () => process.env.MODERATION_ENFORCE_STATUS !== "false" }) {
  function build({ allowRestricted }) {
    return async function authenticate(req, res, next) {
      const header = req.header("Authorization");
      if (!header) {
        return res.status(401).json({ status: "error", message: "No token provided" });
      }
      const token = header.replace("Bearer ", "");

      // 1. Is the token itself good? Only THIS can say "Invalid token".
      let decoded;
      try {
        decoded = jwt.verify(token, process.env.JWT_SECRET);
      } catch (error) {
        return res.status(401).json({ status: "error", message: "Invalid token" });
      }

      // 2. Everything after that (the database lookup, the standing check) can fail for reasons
      //    that have nothing to do with the person's session: the server has just restarted for
      //    an update, the database is still reconnecting, a query timed out. That used to be
      //    answered with the same 401 "Invalid token", and the apps delete the saved login on
      //    that message, so every backend update signed everybody out. It is now a 503 ("try
      //    again"), which the apps treat as a hiccup and leave the session alone.
      try {
        const user = await User.findById(decoded.id).select("tokenVersion status suspendedUntil deletedAt removedAt restrictions");
        if (!user || user.tokenVersion !== decoded.tokenVersion) {
          return res.status(401).json({ status: "error", message: "Session expired. Please login again." });
        }

        const t = now();
        const block = enforce() ? accountBlock(user, t) : null;
        if (block && !allowRestricted) {
          return res.status(403).json({
            status: "error",
            code: block.code,
            message: block.message,
            until: block.until || null,
            appealable: !!block.appealable,
          });
        }

        req.user = decoded;
        // Available to later middleware (e.g. feature restrictions) with no further query.
        req.account = { block, restrictions: activeRestrictions(user, t) };
        next();
      } catch (error) {
        // A validly signed token carrying a malformed id is a bad token, not an outage.
        if (error && error.name === "CastError") {
          return res.status(401).json({ status: "error", message: "Invalid token" });
        }
        console.error("[auth] could not check the session:", error && error.message);
        return res.status(503).json({
          status: "error",
          code: "TEMPORARILY_UNAVAILABLE",
          message: "The server is busy for a moment. Please try again.",
        });
      }
    };
  }

  const authenticate = build({ allowRestricted: false });
  authenticate.allowRestricted = build({ allowRestricted: true });
  return authenticate;
}

module.exports = { createAuth };
