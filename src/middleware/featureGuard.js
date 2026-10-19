"use strict";

// Switches off ONE feature for a person who has a restriction on it (a "mute"): posting,
// commenting, messaging, communities, uploads or reporting. The standing check in auth.middleware
// already attaches the person's ACTIVE restrictions to req.account on every request, so this adds
// no database query.
//
//   router.post("/", auth, requireFeature("posting"), ctrl.createPost);
//
// Put it BEFORE any file-upload middleware, so a restricted person's upload is refused before the
// file is read.

const LABELS = {
  posting: "post", commenting: "comment", messaging: "send messages", communities: "use communities",
  uploads: "upload files", reporting: "send reports",
};

// The restriction that applies to `feature` right now, or null.
function featureBlock(restrictions, feature, now = new Date()) {
  const t = new Date(now).getTime();
  return (restrictions || []).find((r) => r.feature === feature && (!r.until || new Date(r.until).getTime() > t)) || null;
}

function requireFeature(feature, { now = () => new Date() } = {}) {
  return function featureGuard(req, res, next) {
    const hit = featureBlock(req.account && req.account.restrictions, feature, now());
    if (!hit) return next();
    return res.status(403).json({
      status: "error",
      code: "FEATURE_RESTRICTED",
      feature,
      until: hit.until ? new Date(hit.until).toISOString() : null,
      message: `You can't ${LABELS[feature] || feature} right now because of a restriction on your account. Open Account standing in Settings to see why.`,
    });
  };
}

module.exports = { requireFeature, featureBlock, LABELS };
