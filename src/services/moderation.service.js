"use strict";

// The business logic of the reporting system, with its dependencies INJECTED (models, a
// notifier, a clock) so the whole flow is unit-tested without a database
// (tests/moderation.service.test.js). The Express layer in safety.controller.js is thin.

const R = require("../utils/moderation.rules");
const standards = require("../content/communityStandards");

class SafetyError extends Error {
  constructor(status, message, code) {
    super(message);
    this.status = status;
    this.code = code || null;
  }
}

const ENFORCEMENT_LABELS = {
  warning: "Warning",
  content_removal: "Content removed",
  feature_restriction: "Feature restricted",
  temporary_suspension: "Temporary suspension",
  permanent_termination: "Account closed",
};

const FEATURE_LABELS = {
  posting: "Posting", commenting: "Commenting", messaging: "Messaging",
  communities: "Communities", uploads: "Uploading files", reporting: "Reporting",
};

function createModerationService({ models, notifier = null, now = () => new Date() }) {
  const {
    User, Post, Comment, Message, Conversation, Event, Note, PastPaper, DigitalResource,
    Community, CommunityMembership, Discussion, ContentReport, ModerationAction, Appeal,
  } = models;

  const notAvailable = () => new SafetyError(404, "That item could not be found, or it is not available to you.");

  // ---------------------------------------------------------------- visibility helpers
  // A person may only report what they are able to SEE. The same 404 is returned for "does
  // not exist" and "you cannot see it", so reporting cannot be used to probe for private content.
  const sameUniversity = (reporter, universityId) =>
    reporter.role === "superadmin" || (!!universityId && String(universityId) === String(reporter.universityId));

  async function ownerUniversity(ownerId) {
    if (!ownerId) return null;
    const owner = await User.findById(ownerId).select("universityId").lean();
    return owner ? owner.universityId : null;
  }

  async function canSeeCommunity(reporter, communityId) {
    if (!communityId) return true;
    if (reporter.role === "superadmin") return true;
    const m = await CommunityMembership.findOne({
      communityId: String(communityId), userId: reporter.id, status: "active",
    }).select("_id").lean();
    return !!m;
  }

  const postSnapshot = (p) => ({
    title: p.title || "",
    content: p.content || "",
    media: (p.media || []).map((m) => ({ url: m.url, type: m.type })),
  });

  async function loadPost(id, reporter) {
    const post = await Post.findById(id).lean();
    if (!post) return null;
    if (!sameUniversity(reporter, post.universityId)) return null;
    if (!(await canSeeCommunity(reporter, post.communityId))) return null;
    return post;
  }

  // ---------------------------------------------------------------- resolvers
  // One per reportable type. Each returns { ownerId, universityId, communityId, snapshot }
  // or null (missing / not visible). The owner field differs per model, which is the whole
  // reason this registry exists instead of nine separate report systems.
  const resolvers = {
    async profile(id, reporter) {
      const u = await User.findById(id).select("name bio avatarUrl universityId role deletedAt").lean();
      if (!u || u.deletedAt || !sameUniversity(reporter, u.universityId)) return null;
      return {
        ownerId: String(u._id), ownerRole: u.role, universityId: u.universityId, communityId: null,
        snapshot: { name: u.name, bio: u.bio || "", avatarUrl: u.avatarUrl || null },
      };
    },

    async post(id, reporter) {
      const p = await loadPost(id, reporter);
      if (!p) return null;
      return { ownerId: String(p.userId), universityId: p.universityId, communityId: p.communityId || null, snapshot: postSnapshot(p) };
    },

    async comment(id, reporter) {
      const c = await Comment.findById(id).lean();
      if (!c) return null;
      const p = await loadPost(c.postId, reporter);
      if (!p) return null;
      return {
        ownerId: String(c.userId), universityId: p.universityId, communityId: p.communityId || null,
        snapshot: { content: c.content, postId: String(c.postId) },
      };
    },

    // media / video: the report points at a post plus WHICH attachment of it.
    async media(id, reporter, { mediaRef, wantVideo }) {
      const p = await loadPost(id, reporter);
      if (!p) return null;
      const item = (p.media || []).find((m) => m.url === mediaRef);
      if (!item) return null;
      if (wantVideo && item.type !== "video") return null;
      return {
        ownerId: String(p.userId), universityId: p.universityId, communityId: p.communityId || null,
        snapshot: { postId: String(p._id), media: { url: item.url, type: item.type }, postText: p.content || "" },
      };
    },

    async message(id, reporter) {
      const m = await Message.findById(id).lean();
      if (!m) return null;
      const conv = await Conversation.findById(m.conversationId).select("participantIds").lean();
      // Only a participant can report a message, and nobody reports their own.
      if (!conv || !(conv.participantIds || []).map(String).includes(reporter.id)) return null;
      const before = await Message.find({ conversationId: m.conversationId, createdAt: { $lt: m.createdAt } })
        .sort({ createdAt: -1 }).limit(5).select("senderId text fileUrl createdAt").lean();
      return {
        ownerId: String(m.senderId), universityId: reporter.universityId, communityId: null,
        snapshot: {
          text: m.text || "", fileUrl: m.fileUrl || null, conversationId: String(m.conversationId), sentAt: m.createdAt,
          // The reporter already saw these. Shared so a moderator can judge harassment in context.
          context: before.reverse().map((x) => ({
            fromReported: String(x.senderId) === String(m.senderId), text: x.text || "", fileUrl: x.fileUrl || null, sentAt: x.createdAt,
          })),
        },
      };
    },

    async community(id, reporter) {
      const c = await Community.findById(id).lean();
      if (!c || !sameUniversity(reporter, c.universityId)) return null;
      if (c.isPublic === false && !(await canSeeCommunity(reporter, c._id))) return null;
      return {
        ownerId: c.createdBy ? String(c.createdBy) : null, universityId: c.universityId, communityId: String(c._id),
        snapshot: { name: c.name, description: c.description || "", coverImageUrl: c.coverImageUrl || null },
      };
    },

    async event(id, reporter) {
      const e = await Event.findById(id).lean();
      if (!e) return null;
      const uni = await ownerUniversity(e.createdBy);
      if (!sameUniversity(reporter, uni)) return null;
      return {
        ownerId: String(e.createdBy), universityId: uni, communityId: null,
        snapshot: { title: e.title, description: e.description || "", location: e.location || "", date: e.date || null },
      };
    },

    async discussion(id, reporter) {
      const d = await Discussion.findById(id).lean();
      if (!d) return null;
      const uni = await ownerUniversity(d.userId);
      if (!sameUniversity(reporter, uni)) return null;
      return { ownerId: String(d.userId), universityId: uni, communityId: null, snapshot: { content: d.content, courseId: d.courseId || null } };
    },
  };

  // Academic resources share one shape: an uploadedBy owner, a title and a file.
  for (const [type, Model] of [["note", Note], ["past_paper", PastPaper], ["library_resource", DigitalResource]]) {
    resolvers[type] = async (id, reporter) => {
      const r = await Model.findById(id).lean();
      if (!r) return null;
      const uni = await ownerUniversity(r.uploadedBy);
      if (!sameUniversity(reporter, uni)) return null;
      return {
        ownerId: r.uploadedBy ? String(r.uploadedBy) : null, universityId: uni, communityId: null,
        snapshot: { title: r.title, fileUrl: r.fileUrl || null, markingSchemeUrl: r.markingSchemeUrl || null },
      };
    };
  }

  async function uniqueReference() {
    for (let i = 0; i < 6; i++) {
      const ref = R.referenceCode();
      const clash = await ContentReport.findOne({ reference: ref }).select("_id").lean();
      if (!clash) return ref;
    }
    throw new SafetyError(500, "Could not create a report reference. Please try again.");
  }

  // ---------------------------------------------------------------- createReport
  async function createReport({ reporter, body }) {
    const { entityType, entityId, category } = body || {};
    if (!R.ENTITY_TYPE_IDS.includes(entityType)) throw new SafetyError(400, "Unknown content type.");
    if (!R.CATEGORY_IDS.includes(category)) throw new SafetyError(400, "Choose a category for your report.");
    if (!R.isObjectIdLike(entityId)) throw new SafetyError(400, "Invalid item.");

    const isMedia = entityType === "media" || entityType === "video";
    const mediaRef = isMedia ? String(body.mediaUrl || "").slice(0, 500) : null;
    if (isMedia && !mediaRef) throw new SafetyError(400, "Choose which file you are reporting.");

    const imminent = body.imminent === true;
    const description = R.sanitizeDescription(body.description);

    const reporterDoc = await User.findById(reporter.id).select("role universityId reportingBlockedUntil restrictions").lean();
    if (!reporterDoc) throw new SafetyError(401, "Please sign in again.");
    const t = now();
    if (
      (reporterDoc.reportingBlockedUntil && new Date(reporterDoc.reportingBlockedUntil) > t) ||
      R.isRestricted(reporterDoc, "reporting", t)
    ) {
      throw new SafetyError(403, "You can't send reports right now.", "REPORTING_RESTRICTED");
    }
    const rep = { id: String(reporter.id), role: reporterDoc.role, universityId: reporterDoc.universityId };

    // Throttle first, so it cannot be used to probe content either.
    const [lastHourCount, lastDayCount] = await Promise.all([
      ContentReport.countDocuments({ reporterId: rep.id, createdAt: { $gte: new Date(t.getTime() - 3600 * 1000) } }),
      ContentReport.countDocuments({ reporterId: rep.id, createdAt: { $gte: new Date(t.getTime() - 86400 * 1000) } }),
    ]);
    if (R.reportThrottle({ lastHourCount, lastDayCount, category, imminent }).limited) {
      throw new SafetyError(429, "You have sent a lot of reports recently. Please try again later.", "RATE_LIMITED");
    }

    const resolver = resolvers[isMedia ? "media" : entityType];
    const resolved = await resolver(entityId, rep, { mediaRef, wantVideo: entityType === "video" });
    if (!resolved) throw notAvailable();

    if (resolved.ownerId && resolved.ownerId === rep.id) {
      throw new SafetyError(400, "You can't report your own content. You can edit or delete it yourself.");
    }

    // Idempotent: tapping Report twice returns the same receipt instead of a second report.
    const existing = await ContentReport.findOne({
      reporterId: rep.id, entityType, entityId, mediaRef, status: { $in: R.OPEN_STATUSES },
    }).select("reference status createdAt").lean();
    if (existing) {
      return { duplicate: true, reference: existing.reference, status: "open", createdAt: existing.createdAt };
    }

    let ownerRole = resolved.ownerRole;
    if (ownerRole === undefined && resolved.ownerId) {
      const owner = await User.findById(resolved.ownerId).select("role").lean();
      ownerRole = owner ? owner.role : null;
    }
    // Child safety, and anything about an administrator, is visible to superadmins only.
    const restrictedToSuperadmin =
      category === "child_safety" || ownerRole === "admin" || ownerRole === "superadmin";

    const { severity, reason } = R.severityFor({ category, imminent });
    const report = await ContentReport.create({
      reference: await uniqueReference(),
      reporterId: rep.id,
      entityType, entityId, mediaRef,
      reportedUserId: resolved.ownerId || null,
      universityId: resolved.universityId || rep.universityId || null,
      communityId: resolved.communityId || null,
      category, description, imminent,
      evidence: { snapshot: resolved.snapshot, capturedAt: t },
      severity, severityReason: reason, dueAt: R.dueAtFor(severity, t),
      restrictedToSuperadmin,
      status: "open", // explicit: duplicate detection must not depend on a schema default
      events: [{ at: t, actorId: rep.id, type: "created", to: "open" }],
      createdAt: t, updatedAt: t,
    });

    // Never let a notification problem lose or fail a report.
    if (notifier) {
      Promise.resolve()
        .then(() => notifier.reportFiled(report))
        .catch((err) => console.error("✗ Failed to notify moderators:", err && err.message));
    }

    return { duplicate: false, reference: report.reference, status: "open", createdAt: report.createdAt };
  }

  // ---------------------------------------------------------------- reads for the user
  async function listMyReports(userId) {
    const rows = await ContentReport.find({ reporterId: String(userId) })
      .sort({ createdAt: -1 }).limit(50).select("reference entityType category status resolution createdAt").lean();
    return rows.map((r) => ({
      reference: r.reference, entityType: r.entityType, category: r.category,
      status: R.outcomeForReporter(r), createdAt: r.createdAt,
    }));
  }

  async function getAccountStanding(userId) {
    const t = now();
    const user = await User.findById(userId).select("status suspendedUntil restrictions standardsAcceptedVersion deletedAt").lean();
    if (!user) throw new SafetyError(404, "Account not found.");
    const actions = await ModerationAction.find({ userId: String(userId) }).sort({ createdAt: -1 }).limit(20).lean();
    const appeals = actions.length
      ? await Appeal.find({ userId: String(userId), actionId: { $in: actions.map((a) => String(a._id)) } }).lean()
      : [];
    const appealByAction = new Map(appeals.map((a) => [String(a.actionId), a]));

    return {
      status: user.status || "active",
      block: R.accountBlock(user, t),
      restrictions: R.activeRestrictions(user, t).map((r) => ({
        feature: r.feature, label: FEATURE_LABELS[r.feature] || r.feature, until: r.until || null,
      })),
      standards: {
        acceptedVersion: user.standardsAcceptedVersion || null,
        currentVersion: standards.version,
        needsAcceptance: user.standardsAcceptedVersion !== standards.version,
      },
      // Deliberately omits moderatorId and reportId: moderators and reporters stay confidential.
      actions: actions.map((a) => {
        const appeal = appealByAction.get(String(a._id)) || null;
        return {
          id: String(a._id), actionType: a.actionType, label: ENFORCEMENT_LABELS[a.actionType] || a.actionType,
          reason: a.reason, policySection: a.policySection || null, startsAt: a.startsAt,
          expiresAt: a.expiresAt || null, status: a.status, createdAt: a.createdAt,
          appeal: appeal ? { status: appeal.status, decision: appeal.decision || null, decisionReason: appeal.decisionReason || "", decidedAt: appeal.decidedAt || null } : null,
          canAppeal: R.appealEligibility({ action: a, existingAppeal: appeal, now: t }).ok,
        };
      }),
    };
  }

  async function acceptStandards(userId, version) {
    if (version !== standards.version) {
      throw new SafetyError(400, "These standards have been updated. Please reload and read the latest version.", "STANDARDS_OUT_OF_DATE");
    }
    await User.updateOne({ _id: userId }, { $set: { standardsAcceptedVersion: version, standardsAcceptedAt: now() } });
    return { acceptedVersion: version };
  }

  // ---------------------------------------------------------------- public config
  function getConfig() {
    return {
      standardsVersion: standards.version,
      categories: R.CATEGORIES,
      entityTypes: R.ENTITY_TYPES,
      severities: R.SEVERITY_META,
      enforcementActions: R.ENFORCEMENT_ACTIONS.map((id) => ({ id, label: ENFORCEMENT_LABELS[id] })),
      restrictableFeatures: R.RESTRICTABLE_FEATURES.map((id) => ({ id, label: FEATURE_LABELS[id] })),
      appealWindowDays: R.APPEAL_WINDOW_DAYS,
      limits: { descriptionMax: R.REPORT_LIMITS.descriptionMax, maxSuspensionDays: R.MAX_SUSPENSION_DAYS },
    };
  }

  return { createReport, listMyReports, getAccountStanding, acceptStandards, getConfig };
}

module.exports = { createModerationService, SafetyError, ENFORCEMENT_LABELS, FEATURE_LABELS };
