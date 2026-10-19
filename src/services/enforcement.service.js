"use strict";

// Penalties: imposing them, the second-moderator rule for terminations, lifting them, and the
// appeal flow. Business logic only. Dependencies are INJECTED (models, a notifier, a content
// remover, a clock) so the whole flow is unit-tested without a database
// (tests/enforcement.service.test.js). The Express layer is enforcement.controller.js.

const R = require("../utils/moderation.rules");
const E = require("../utils/enforcement.rules");
const standards = require("../content/communityStandards");
const { cleanText, clampInt } = require("../utils/adminScope");
const { SafetyError, ENFORCEMENT_LABELS } = require("./moderation.service");

const SECTION_IDS = standards.sections.map((s) => s.id);
const REPORT_REMOVAL_TYPES = ["post", "comment", "message", "discussion", "note", "past_paper", "library_resource", "event", "media", "video"];
const isId = (v) => R.isObjectIdLike(String(v || ""));

// One plain sentence per rule failure. The rules return codes; people get these.
const DENIED = {
  report_not_found: [404, "Report not found."],
  user_not_found: [404, "That account no longer exists."],
  action_not_found: [404, "That decision could not be found."],
  cannot_act_on_self: [403, "You can't take action against your own account."],
  cannot_act_on_superadmin: [403, "A superadmin account can't be penalised through reports."],
  only_superadmin_can_act_on_admin: [403, "Only a superadmin can take action against an administrator."],
  outside_your_university: [403, "That person belongs to another university."],
  you_filed_this_report: [403, "You filed this report, so you can't decide it. Another moderator must."],
  you_are_the_reported_user: [403, "This report is about you, so you can't decide it."],
  report_closed: [409, "This report is already closed."],
  escalated_to_superadmin: [403, "Escalated reports are handled by a superadmin."],
  termination_requires_severe_case_or_superadmin: [403, "An admin can only propose closing an account in a severe (P0 or P1) case. Escalate this report to a superadmin."],
  not_a_platform_moderator: [403, "Admins only."],
  unknown_action: [400, "Choose an action."],
  approver_must_differ_from_proposer: [403, "A different moderator must approve closing an account."],
  approval_expired: [409, "This proposal expired before anyone approved it."],
  not_awaiting_approval: [409, "This is not waiting for approval."],
  not_a_termination: [400, "Only account closures need a second moderator."],
  restricted_to_superadmin: [403, "Only a superadmin can decide this case."],
  reviewer_must_be_independent: [403, "You took part in the original decision, so another moderator must decide this appeal."],
  superadmin_required: [403, "Only a superadmin can decide this appeal."],
  cannot_review_own_appeal: [403, "You can't review your own appeal."],
  not_final: [409, "This decision isn't final yet, so it can't be appealed."],
  already_lifted: [409, "This penalty was already lifted."],
  already_overturned: [409, "This decision was already overturned."],
  already_appealed: [409, "You have already appealed this decision."],
  appeal_window_closed: [409, `The ${R.APPEAL_WINDOW_DAYS}-day appeal window has closed.`],
  cannot_reduce_this_action: [400, "Only a suspension, a restriction or an account closure can be reduced."],
  unknown_decision: [400, "Choose upheld, overturned or reduced."],
  duration_out_of_range: [400, `Choose a whole number of days from 1 to ${R.MAX_SUSPENSION_DAYS}.`],
};
function denied(reason) {
  const [status, message] = DENIED[reason] || [403, "You can't do that."];
  return new SafetyError(status, message, String(reason).toUpperCase());
}

function createEnforcementService({ models, notifier = null, contentRemover = null, now = () => new Date() }) {
  const { User, ContentReport, ModerationAction, Appeal, AuditLog } = models;

  // ---------------------------------------------------------------- small helpers
  const asActor = (u) => ({ id: String(u.id || u._id), role: u.role, universityId: u.universityId || null, email: u.email || "" });

  async function audit(actor, action, targetId, extra = {}) {
    if (!AuditLog) return;
    try {
      await AuditLog.create({
        adminId: actor.id, adminEmail: actor.email || "unknown", action, targetType: "User", targetId: String(targetId),
        result: "success", reason: extra.reason, previousState: extra.previousState, resultingState: extra.resultingState, metadata: extra.metadata,
      });
    } catch (e) {
      console.error("Audit log failed:", e && e.message);
    }
  }
  // A notification problem must never undo or fail a decision.
  const tell = (fn) => {
    if (!notifier) return;
    Promise.resolve().then(fn).catch((e) => console.error("✗ Enforcement notification failed:", e && e.message));
  };
  const tellUser = (userId, kind, actionType) => tell(() => notifier.user({ userId: String(userId), kind, actionType }));
  const tellModerators = (info) => tell(() => notifier.moderators(info));

  async function loadUser(id) {
    if (!isId(id)) return null;
    const u = await User.findById(id).select("role universityId status suspendedUntil deletedAt restrictions name").lean();
    return u ? { ...u, id: String(u._id) } : null;
  }

  // Recompute the account's block from every action still in force (see userStateAfterLift).
  async function recomputeBlock(action) {
    const others = await ModerationAction.find({ userId: String(action.userId) }).lean();
    const state = E.userStateAfterLift({ lifted: { _id: "recompute", previousState: action.previousState }, otherActions: others, now: now() });
    await User.updateOne({ _id: action.userId }, { $set: state });
    return state;
  }
  async function dropRestriction(action) {
    const u = await User.findById(action.userId).select("restrictions").lean();
    const next = ((u && u.restrictions) || []).filter((r) => String(r.actionId) !== String(action._id));
    await User.updateOne({ _id: action.userId }, { $set: { restrictions: next } });
  }
  // Take a lifted action off the account. Its own status must already be saved.
  async function liftFromAccount(action) {
    if (action.actionType === "feature_restriction") return dropRestriction(action);
    if (action.actionType === "temporary_suspension" || action.actionType === "permanent_termination") return recomputeBlock(action);
    return null;
  }

  // ---------------------------------------------------------------- impose
  async function imposeAction({ actor: rawActor, reportId, body }) {
    const actor = asActor(rawActor);
    const b = body || {};
    const actionType = b.actionType;
    if (!R.ENFORCEMENT_ACTIONS.includes(actionType)) throw denied("unknown_action");
    const reason = cleanText(b.reason, 2000);
    if (!reason) throw new SafetyError(400, "Write the reason the person will be shown (1 to 2000 characters).");

    if (!isId(reportId)) throw denied("report_not_found");
    const report = await ContentReport.findById(reportId).lean();
    const onReport = E.canActOnReport({ actor, report });
    if (!onReport.ok) throw denied(onReport.reason);
    if (!report.reportedUserId) throw new SafetyError(400, "This report is not about an account, so there is nobody to take action against.");

    const category = R.CATEGORIES.find((c) => c.id === report.category);
    const policySection = b.policySection ? String(b.policySection) : category && category.section;
    if (!policySection || !SECTION_IDS.includes(policySection)) {
      throw new SafetyError(400, "Choose the Community Standards section this breaks.", "POLICY_SECTION_REQUIRED");
    }

    const target = await loadUser(report.reportedUserId);
    if (!target || target.deletedAt) throw denied("user_not_found");
    const onUser = E.canActOnUser({ actor, target });
    if (!onUser.ok) throw denied(onUser.reason);
    if (target.status === "terminated") throw new SafetyError(409, "This account is already closed.");

    const proposing = actionType === "permanent_termination";
    const allowed = proposing
      ? E.canProposeTermination({ role: actor.role, severity: report.severity })
      : R.canEnforce({ role: actor.role, action: actionType, severity: report.severity });
    if (!allowed.ok) throw denied(allowed.reason);

    const prior = await ModerationAction.find({ userId: target.id }).lean();
    if (proposing && prior.some((a) => a.actionType === "permanent_termination" && a.status === "pending_approval")) {
      throw new SafetyError(409, "Closing this account is already waiting for a second moderator.");
    }
    const t = now();
    const ladder = E.checkLadder({ actionType, severity: report.severity, priorActions: prior, now: t });
    if (!ladder.ok) {
      throw new SafetyError(
        409,
        `For this severity and this person's record, the most you can impose now is "${ENFORCEMENT_LABELS[ladder.maxAction] || ladder.maxAction}". Start lower, or escalate the report.`,
        "SKIPS_THE_LADDER"
      );
    }
    let feature = null;
    if (actionType === "feature_restriction") {
      if (!R.RESTRICTABLE_FEATURES.includes(b.feature)) throw new SafetyError(400, "Choose which feature to restrict.", "FEATURE_REQUIRED");
      feature = b.feature;
    }

    const dur = E.validateDuration(actionType, b.durationDays);
    if (!dur.ok) throw new SafetyError(400, `Choose a whole number of days from 1 to ${dur.max}.`, "DURATION_OUT_OF_RANGE");
    if (actionType === "content_removal") {
      if (!contentRemover || !REPORT_REMOVAL_TYPES.includes(report.entityType) || !contentRemover.canRemove(report.entityType)) {
        throw new SafetyError(400, "This kind of content can't be removed automatically. Use a warning, a restriction or a suspension instead.", "NOT_REMOVABLE");
      }
    }

    const hold = proposing && E.isSevere(report.severity); // severe cases freeze the account while waiting for a second moderator
    const startsAt = t;
    const expiresAt = dur.days ? E.addDays(t, dur.days) : null;
    const pendingExpiresAt = proposing ? E.addDays(t, E.TERMINATION_APPROVAL_DAYS) : null;

    // Remove the content first: if this fails nothing is recorded and the moderator can retry.
    if (actionType === "content_removal") {
      await contentRemover.remove({ entityType: report.entityType, entityId: report.entityId, mediaRef: report.mediaRef || null });
    }

    const action = await ModerationAction.create({
      userId: target.id, actionType, reason, policySection, reportId: String(report._id), moderatorId: actor.id,
      entity: { type: report.entityType, id: report.entityId }, feature,
      startsAt, expiresAt, pendingExpiresAt,
      status: proposing ? "pending_approval" : "active",
      universityId: report.universityId || target.universityId || null,
      restrictedToSuperadmin: !!report.restrictedToSuperadmin,
      // A copy of what was reported: the content may be deleted or edited later, and an appeal needs it.
      evidence: { snapshot: (report.evidence && report.evidence.snapshot) ?? null, capturedAt: (report.evidence && report.evidence.capturedAt) ?? null },
      previousState: { status: target.status || "active", suspendedUntil: target.suspendedUntil || null },
      createdAt: t,
    });

    const update = proposing
      ? (hold ? E.userUpdateForAction({ action, user: target, holdOnly: true }) : null)
      : E.userUpdateForAction({ action, user: target });
    if (update) await User.updateOne({ _id: target.id }, update);
    const resultingState = update && update.$set ? update.$set : update ? { restriction: feature, until: expiresAt } : null;
    if (resultingState) await ModerationAction.updateOne({ _id: action._id }, { $set: { resultingState } });

    await ContentReport.updateOne({ _id: report._id }, {
      $push: {
        "resolution.actionIds": String(action._id),
        events: { at: t, actorId: actor.id, type: "action_imposed", from: null, to: actionType, note: (proposing ? `${actionType} proposed, waiting for a second moderator` : actionType).slice(0, 1000) },
      },
      $set: { updatedAt: t, ...(report.status === "open" ? { status: "in_review", assignedTo: report.assignedTo || actor.id, assignedAt: report.assignedAt || t } : {}) },
    });

    await audit(actor, proposing ? "MODERATION_TERMINATION_PROPOSE" : "MODERATION_ACTION_IMPOSE", target.id, {
      reason, previousState: action.previousState, resultingState,
      metadata: { actionId: String(action._id), reportId: String(report._id), actionType, policySection, severity: report.severity },
    });

    if (proposing) {
      if (hold) tellUser(target.id, "held", actionType);
      tellModerators({ kind: "termination_pending", actionId: String(action._id), universityId: action.universityId, restricted: action.restrictedToSuperadmin, excludeIds: [actor.id] });
    } else {
      tellUser(target.id, "imposed", actionType);
    }
    return { id: String(action._id), actionType, status: action.status, expiresAt, awaitingApproval: proposing, accountHeld: hold, approvalDeadline: pendingExpiresAt };
  }

  // ---------------------------------------------------------------- terminations: the second moderator
  async function decideTermination({ actor: rawActor, actionId, approve, note }) {
    const actor = asActor(rawActor);
    if (!isId(actionId)) throw denied("action_not_found");
    const action = await ModerationAction.findById(actionId).lean();
    if (!action || action.actionType !== "permanent_termination") throw denied("action_not_found");
    if (action.restrictedToSuperadmin && actor.role !== "superadmin") throw denied("action_not_found");
    const target = await loadUser(action.userId);
    const t = now();
    const can = E.canApproveTermination({ approver: actor, action, target, restricted: action.restrictedToSuperadmin, now: t });
    if (!can.ok) throw denied(can.reason);
    const text = cleanText(note, 1000);
    if (!approve && !text) throw new SafetyError(400, "Say why you are not approving this (1 to 1000 characters).");

    const won = await ModerationAction.updateOne(
      { _id: action._id, status: "pending_approval" },
      approve
        ? { $set: { status: "active", approvedBy: actor.id, approvedAt: t, startsAt: t, expiresAt: null, resultingState: { status: "terminated" } } }
        : { $set: { status: "rejected", rejectedBy: actor.id, rejectedAt: t, rejectionNote: text } }
    );
    if (!won || !won.modifiedCount) throw new SafetyError(409, "Someone else already decided this. Reload and check.");

    if (approve) {
      await User.updateOne({ _id: action.userId }, { $set: { status: "terminated", suspendedUntil: null } });
    } else {
      await recomputeBlock({ ...action, status: "rejected" }); // the hold, if there was one, ends
    }
    if (action.reportId && isId(action.reportId)) {
      await ContentReport.updateOne({ _id: action.reportId }, {
        $push: { events: { at: t, actorId: actor.id, type: approve ? "termination_approved" : "termination_rejected", from: "pending_approval", to: approve ? "active" : "rejected", note: (text || "").slice(0, 1000) } },
        $set: { updatedAt: t },
      });
    }
    await audit(actor, approve ? "MODERATION_TERMINATION_APPROVE" : "MODERATION_TERMINATION_REJECT", action.userId, {
      reason: text || undefined, metadata: { actionId: String(action._id), proposedBy: action.moderatorId },
    });
    tellUser(action.userId, approve ? "closed" : "restored", "permanent_termination");
    tellModerators({ kind: "termination_decided", actionId: String(action._id), recipientIds: [action.moderatorId], approved: !!approve });
    return { id: String(action._id), status: approve ? "active" : "rejected" };
  }

  // ---------------------------------------------------------------- lifting early
  async function revokeAction({ actor: rawActor, actionId, reason }) {
    const actor = asActor(rawActor);
    if (!isId(actionId)) throw denied("action_not_found");
    const action = await ModerationAction.findById(actionId).lean();
    if (!action) throw denied("action_not_found");
    if (action.restrictedToSuperadmin && actor.role !== "superadmin") throw denied("action_not_found");
    if (actor.role !== "admin" && actor.role !== "superadmin") throw denied("not_a_platform_moderator");
    const target = await loadUser(action.userId);
    if (!target) throw denied("user_not_found");
    const scope = E.canActOnUser({ actor, target });
    if (!scope.ok) throw denied(scope.reason);
    if (action.status !== "active") throw new SafetyError(409, "This penalty is not in force.");
    if (action.actionType === "content_removal") throw new SafetyError(400, "Removed content can't be restored automatically.");
    if (action.actionType === "permanent_termination" && actor.role !== "superadmin") {
      throw new SafetyError(403, "Only a superadmin can lift an account closure.", "SUPERADMIN_REQUIRED");
    }
    const text = cleanText(reason, 1000);
    if (!text) throw new SafetyError(400, "Record why you are lifting this (1 to 1000 characters).");

    const t = now();
    const won = await ModerationAction.updateOne({ _id: action._id, status: "active" }, { $set: { status: "revoked", revokedBy: actor.id, revokedAt: t, revokedReason: text } });
    if (!won || !won.modifiedCount) throw new SafetyError(409, "This penalty changed while you were looking. Reload and try again.");
    await liftFromAccount({ ...action, status: "revoked" });
    await audit(actor, "MODERATION_ACTION_REVOKE", action.userId, { reason: text, metadata: { actionId: String(action._id), actionType: action.actionType } });
    tellUser(action.userId, "lifted", action.actionType);
    return { id: String(action._id), status: "revoked" };
  }

  // ---------------------------------------------------------------- appeals: the person's side
  async function submitAppeal({ userId, actionId, statement }) {
    if (!isId(actionId)) throw denied("action_not_found");
    const action = await ModerationAction.findById(actionId).lean();
    // Same answer for "no such decision" and "not yours".
    if (!action || String(action.userId) !== String(userId)) throw denied("action_not_found");
    const existing = await Appeal.findOne({ actionId: String(action._id) }).lean();
    const t = now();
    const ok = E.appealable({ action, existingAppeal: existing, now: t });
    if (!ok.ok) throw denied(ok.reason);
    const text = cleanText(statement, 2000);
    if (!text || text.length < 10) throw new SafetyError(400, "Tell us in your own words why you disagree (10 to 2000 characters).", "STATEMENT_REQUIRED");

    let appeal;
    try {
      appeal = await Appeal.create({
        actionId: String(action._id), userId: String(userId),
        original: { actionType: action.actionType, reason: action.reason, appliedAt: action.startsAt, moderatorId: action.moderatorId },
        statement: text, status: "pending",
        universityId: action.universityId || null, restrictedToSuperadmin: !!action.restrictedToSuperadmin,
        createdAt: t,
      });
    } catch (e) {
      if (e && e.code === 11000) throw denied("already_appealed"); // two taps at once: the unique index decides
      throw e;
    }
    tellModerators({
      kind: "appeal_filed", appealId: String(appeal._id), universityId: action.universityId, restricted: !!action.restrictedToSuperadmin,
      excludeIds: [action.moderatorId, action.approvedBy].filter(Boolean),
    });
    return { id: String(appeal._id), status: "pending", createdAt: t };
  }

  // ---------------------------------------------------------------- appeals: the moderator's side
  async function decideAppeal({ actor: rawActor, appealId, body }) {
    const actor = asActor(rawActor);
    const b = body || {};
    if (!isId(appealId)) throw new SafetyError(404, "Appeal not found.");
    const appeal = await Appeal.findById(appealId).lean();
    if (!appeal) throw new SafetyError(404, "Appeal not found.");
    if (appeal.restrictedToSuperadmin && actor.role !== "superadmin") throw new SafetyError(404, "Appeal not found.");
    if (appeal.status !== "pending" && appeal.status !== "under_review") throw new SafetyError(409, "This appeal was already decided.");
    const action = await ModerationAction.findById(appeal.actionId).lean();
    if (!action) throw denied("action_not_found");

    const can = E.canDecideAppeal({ reviewer: actor, action, appeal, restricted: !!appeal.restrictedToSuperadmin });
    if (!can.ok) throw denied(can.reason);
    const reasonText = cleanText(b.reason, 2000);
    if (!reasonText) throw new SafetyError(400, "Explain your decision. The person will be shown it (1 to 2000 characters).");
    const v = E.validateAppealDecision({ action, decision: b.decision, reducedToDays: b.reducedToDays });
    if (!v.ok) {
      if (v.reason === "must_be_shorter") throw new SafetyError(400, `Choose fewer than ${v.was} days, or uphold the decision.`, "MUST_BE_SHORTER");
      throw denied(v.reason);
    }

    const t = now();
    const won = await Appeal.updateOne(
      { _id: appeal._id, status: { $in: ["pending", "under_review"] } },
      { $set: { status: b.decision, decision: b.decision, decisionReason: reasonText, reviewerId: actor.id, decidedAt: t } }
    );
    if (!won || !won.modifiedCount) throw new SafetyError(409, "Someone else already decided this appeal.");

    if (b.decision === "overturned") {
      await ModerationAction.updateOne({ _id: action._id }, { $set: { status: "overturned" } });
      await liftFromAccount({ ...action, status: "overturned" });
    } else if (b.decision === "reduced") {
      await applyReduction({ action, days: v.days, t });
    }
    await audit(actor, "MODERATION_APPEAL_DECIDE", action.userId, {
      reason: reasonText, metadata: { appealId: String(appeal._id), actionId: String(action._id), decision: b.decision, reducedToDays: v.days },
    });
    tellUser(action.userId, "appeal_decided", action.actionType);
    return { id: String(appeal._id), status: b.decision };
  }

  async function applyReduction({ action, days, t }) {
    if (action.actionType === "permanent_termination") {
      // Closing the account is softened into a suspension that starts now.
      const ends = E.addDays(t, days);
      await ModerationAction.updateOne({ _id: action._id }, {
        $set: { actionType: "temporary_suspension", reducedFrom: "permanent_termination", status: "active", startsAt: t, expiresAt: ends, resultingState: { status: "suspended", suspendedUntil: ends } },
      });
      await User.updateOne({ _id: action.userId }, { $set: { status: "suspended", suspendedUntil: ends } });
      return;
    }
    const ends = E.addDays(action.startsAt, days);
    const over = ends.getTime() <= new Date(t).getTime();
    await ModerationAction.updateOne({ _id: action._id }, { $set: { expiresAt: ends, ...(over ? { status: "expired" } : {}) } });
    if (action.actionType === "temporary_suspension") {
      await recomputeBlock({ ...action, status: over ? "expired" : "active", expiresAt: ends });
    } else if (action.actionType === "feature_restriction") {
      const u = await User.findById(action.userId).select("restrictions").lean();
      const next = ((u && u.restrictions) || [])
        .map((r) => (String(r.actionId) === String(action._id) ? { ...r, until: ends } : r))
        .filter((r) => !(String(r.actionId) === String(action._id) && over));
      await User.updateOne({ _id: action.userId }, { $set: { restrictions: next } });
    }
  }

  // ---------------------------------------------------------------- housekeeping
  // Ends penalties whose time is up and lets unapproved closures lapse. Safe to run any number
  // of times. (A suspension already stops enforcing itself the moment suspendedUntil passes; this
  // keeps the records and the account's status label honest.)
  async function sweepExpired() {
    const t = now();
    let ended = 0, lapsed = 0;
    const timed = await ModerationAction.find({
      status: "active", actionType: { $in: ["temporary_suspension", "feature_restriction"] }, expiresAt: { $ne: null, $lte: t },
    }).limit(200).lean();
    for (const a of timed) {
      const won = await ModerationAction.updateOne({ _id: a._id, status: "active" }, { $set: { status: "expired" } });
      if (!won || !won.modifiedCount) continue;
      await liftFromAccount({ ...a, status: "expired" });
      ended++;
    }
    const proposals = await ModerationAction.find({ status: "pending_approval", pendingExpiresAt: { $lte: t } }).limit(200).lean();
    for (const a of proposals) {
      const won = await ModerationAction.updateOne({ _id: a._id, status: "pending_approval" }, { $set: { status: "rejected", rejectedAt: t, rejectionNote: `Not approved within ${E.TERMINATION_APPROVAL_DAYS} days.` } });
      if (!won || !won.modifiedCount) continue;
      await recomputeBlock({ ...a, status: "rejected" });
      tellModerators({ kind: "termination_decided", actionId: String(a._id), recipientIds: [a.moderatorId], approved: false, lapsed: true });
      lapsed++;
    }
    return { ended, lapsed };
  }

  // ---------------------------------------------------------------- moderator reads
  const visible = (actor) => {
    const f = {};
    if (actor.role !== "superadmin") f.restrictedToSuperadmin = { $ne: true };
    if (!(actor.role === "superadmin" || !actor.universityId)) f.universityId = String(actor.universityId);
    return f;
  };
  async function namesFor(ids) {
    const clean = [...new Set(ids.filter(isId).map(String))];
    if (!clean.length) return new Map();
    const rows = await User.find({ _id: { $in: clean } }).select("name role").lean();
    return new Map(rows.map((u) => [String(u._id), u]));
  }
  const page = (q, def = 20) => ({ page: clampInt(q && q.page, 1, 1, 100000), limit: clampInt(q && q.limit, def, 1, 50) });

  async function listActions({ actor: rawActor, query }) {
    const actor = asActor(rawActor);
    const { page: p, limit } = page(query);
    const filter = { ...visible(actor), actionType: { $in: ["warning", "feature_restriction", "temporary_suspension", "permanent_termination", "content_removal"] } };
    const s = query && typeof query.status === "string" ? query.status : "pending_approval";
    if (s !== "all") filter.status = ["pending_approval", "active", "expired", "revoked", "overturned", "rejected"].includes(s) ? s : "pending_approval";
    const [total, rows] = await Promise.all([
      ModerationAction.countDocuments(filter),
      ModerationAction.find(filter).sort({ createdAt: -1 }).skip((p - 1) * limit).limit(limit).lean(),
    ]);
    const names = await namesFor(rows.flatMap((r) => [r.userId, r.moderatorId, r.approvedBy]));
    const nm = (id) => (id && names.get(String(id)) ? names.get(String(id)).name : null);
    const t = now();
    return {
      data: rows.map((r) => ({
        id: String(r._id), actionType: r.actionType, label: ENFORCEMENT_LABELS[r.actionType] || r.actionType, status: r.status,
        userId: String(r.userId), userName: nm(r.userId), reason: r.reason, policySection: r.policySection || null,
        proposedByName: nm(r.moderatorId), approvedByName: nm(r.approvedBy), createdAt: r.createdAt,
        expiresAt: r.expiresAt || null, pendingExpiresAt: r.pendingExpiresAt || null, reportId: r.reportId || null,
        canApprove: r.status === "pending_approval" && E.canApproveTermination({ approver: actor, action: r, target: null, restricted: r.restrictedToSuperadmin, now: t }).ok,
      })),
      pagination: { page: p, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async function getAction({ actor: rawActor, actionId }) {
    const actor = asActor(rawActor);
    if (!isId(actionId)) throw denied("action_not_found");
    const a = await ModerationAction.findById(actionId).lean();
    if (!a || (a.restrictedToSuperadmin && actor.role !== "superadmin")) throw denied("action_not_found");
    if (!(actor.role === "superadmin" || !actor.universityId) && String(a.universityId || "") !== String(actor.universityId)) throw denied("action_not_found");
    const names = await namesFor([a.userId, a.moderatorId, a.approvedBy, a.rejectedBy, a.revokedBy]);
    const nm = (id) => (id && names.get(String(id)) ? names.get(String(id)).name : null);
    return {
      id: String(a._id), actionType: a.actionType, status: a.status, reason: a.reason, policySection: a.policySection || null, feature: a.feature || null,
      userId: String(a.userId), userName: nm(a.userId), proposedByName: nm(a.moderatorId), approvedByName: nm(a.approvedBy),
      rejectedByName: nm(a.rejectedBy), rejectionNote: a.rejectionNote || null, revokedByName: nm(a.revokedBy), revokedReason: a.revokedReason || null,
      startsAt: a.startsAt, expiresAt: a.expiresAt || null, pendingExpiresAt: a.pendingExpiresAt || null, reportId: a.reportId || null,
      evidence: a.evidence || null, reducedFrom: a.reducedFrom || null, createdAt: a.createdAt,
    };
  }

  async function listAppeals({ actor: rawActor, query }) {
    const actor = asActor(rawActor);
    const { page: p, limit } = page(query);
    const filter = { ...visible(actor) };
    const s = query && typeof query.status === "string" ? query.status : "pending";
    if (s === "pending") filter.status = { $in: ["pending", "under_review"] };
    else if (s !== "all") filter.status = ["upheld", "overturned", "reduced"].includes(s) ? s : { $in: ["pending", "under_review"] };
    const [total, rows] = await Promise.all([
      Appeal.countDocuments(filter),
      Appeal.find(filter).sort({ createdAt: 1 }).skip((p - 1) * limit).limit(limit).lean(),
    ]);
    const actions = new Map();
    for (const r of rows) actions.set(String(r.actionId), await ModerationAction.findById(r.actionId).lean());
    const names = await namesFor(rows.map((r) => r.userId));
    return {
      data: rows.map((r) => {
        const action = actions.get(String(r.actionId));
        const can = action ? E.canDecideAppeal({ reviewer: actor, action, appeal: r, restricted: !!r.restrictedToSuperadmin }) : { ok: false, reason: "action_not_found" };
        return {
          id: String(r._id), status: r.status, actionType: r.original && r.original.actionType, userName: names.get(String(r.userId)) ? names.get(String(r.userId)).name : null,
          createdAt: r.createdAt, decidedAt: r.decidedAt || null, canDecide: r.status === "pending" || r.status === "under_review" ? can.ok : false,
          cannotDecideBecause: can.ok ? null : (DENIED[can.reason] || [0, "Not available to you."])[1],
        };
      }),
      pagination: { page: p, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
    };
  }

  async function getAppeal({ actor: rawActor, appealId }) {
    const actor = asActor(rawActor);
    if (!isId(appealId)) throw new SafetyError(404, "Appeal not found.");
    const ap = await Appeal.findById(appealId).lean();
    if (!ap || (ap.restrictedToSuperadmin && actor.role !== "superadmin")) throw new SafetyError(404, "Appeal not found.");
    if (!(actor.role === "superadmin" || !actor.universityId) && String(ap.universityId || "") !== String(actor.universityId)) throw new SafetyError(404, "Appeal not found.");
    const action = await ModerationAction.findById(ap.actionId).lean();
    const can = action ? E.canDecideAppeal({ reviewer: actor, action, appeal: ap, restricted: !!ap.restrictedToSuperadmin }) : { ok: false, reason: "action_not_found" };
    const names = await namesFor([ap.userId, action && action.moderatorId, action && action.approvedBy, ap.reviewerId]);
    const nm = (id) => (id && names.get(String(id)) ? names.get(String(id)).name : null);
    return {
      id: String(ap._id), status: ap.status, statement: ap.statement, createdAt: ap.createdAt, decision: ap.decision || null,
      decisionReason: ap.decisionReason || "", decidedAt: ap.decidedAt || null, reviewerName: nm(ap.reviewerId),
      userName: nm(ap.userId), userId: String(ap.userId),
      action: action && {
        id: String(action._id), actionType: action.actionType, reducedFrom: action.reducedFrom || null, reason: action.reason, policySection: action.policySection || null,
        startsAt: action.startsAt, expiresAt: action.expiresAt || null, imposedByName: nm(action.moderatorId), approvedByName: nm(action.approvedBy),
        evidence: action.evidence || null, reportId: action.reportId || null, durationDays: E.originalDays(action),
      },
      canDecide: ap.status === "pending" || ap.status === "under_review" ? can.ok : false,
      cannotDecideBecause: can.ok ? null : (DENIED[can.reason] || [0, "Not available to you."])[1],
    };
  }

  return { imposeAction, decideTermination, revokeAction, submitAppeal, decideAppeal, sweepExpired, listActions, getAction, listAppeals, getAppeal };
}

module.exports = { createEnforcementService, DENIED, SECTION_IDS };
