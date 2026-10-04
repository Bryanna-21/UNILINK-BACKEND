const { createModerationService, SafetyError } = require("../services/moderation.service");
const notifier = require("../services/moderation.notify");
const standards = require("../content/communityStandards");

const service = createModerationService({
  models: {
    User: require("../models/User"),
    Post: require("../models/Post"),
    Comment: require("../models/Comment"),
    Message: require("../models/Message"),
    Conversation: require("../models/Conversation"),
    Event: require("../models/Event"),
    Note: require("../models/Note"),
    PastPaper: require("../models/PastPaper"),
    DigitalResource: require("../models/DigitalResource"),
    Community: require("../models/Community"),
    CommunityMembership: require("../models/CommunityMembership"),
    Discussion: require("../models/Discussion"),
    ContentReport: require("../models/ContentReport"),
    ModerationAction: require("../models/ModerationAction"),
    Appeal: require("../models/Appeal"),
  },
  notifier,
});

// Known problems become clear messages; anything unexpected becomes a generic 500. The
// internal error text is logged but never sent back: unlike older endpoints, safety
// responses must not leak internals.
function handler(fn, { successStatus = 200, cache = false } = {}) {
  return async (req, res) => {
    try {
      const result = await fn(req);
      if (cache) res.set("Cache-Control", "public, max-age=300");
      return res.status(typeof successStatus === "function" ? successStatus(result) : successStatus).json({ status: "success", data: result });
    } catch (err) {
      if (err instanceof SafetyError) {
        return res.status(err.status).json({ status: "error", code: err.code, message: err.message });
      }
      console.error("Safety endpoint error:", err);
      return res.status(500).json({ status: "error", message: "Something went wrong. Please try again." });
    }
  };
}

// PUBLIC: readable without an account.
exports.getConfig = handler(async () => service.getConfig(), { cache: true });
exports.getStandards = handler(async () => standards, { cache: true });

exports.createReport = handler(
  async (req) => service.createReport({ reporter: { id: req.user.id }, body: req.body }),
  { successStatus: (r) => (r.duplicate ? 200 : 201) }
);

exports.myReports = handler(async (req) => service.listMyReports(req.user.id));

// Reachable by suspended and terminated accounts too (see the route): it is how they find
// out why, and how they get to appeal.
exports.myStanding = handler(async (req) => service.getAccountStanding(req.user.id));

exports.acceptStandards = handler(async (req) => service.acceptStandards(req.user.id, req.body && req.body.version));
