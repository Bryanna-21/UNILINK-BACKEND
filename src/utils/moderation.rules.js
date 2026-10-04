"use strict";

// UniLink Safety & Moderation: the single source of truth for categories, severities,
// the enforcement ladder and the permission/eligibility rules.
//
// Deliberately PURE (no database, no Express): the web app, the mobile app and the backend
// all read these definitions through GET /api/safety/config, so the two clients can never
// disagree about what a category or an enforcement action means, and every rule below is
// unit-tested without a database (tests/moderation.rules.test.js).

const crypto = require("crypto");

// ---------------------------------------------------------------- report categories
// `section` links each category to the Community Standards section that governs it.
const CATEGORIES = [
  { id: "harassment", label: "Harassment or bullying", section: "respect-harassment",
    description: "Targeting, humiliating or repeatedly bothering someone." },
  { id: "hate_speech", label: "Hate speech", section: "hate-discrimination",
    description: "Attacking people for who they are, such as ethnicity, religion, gender, disability or tribe." },
  { id: "threats_violence", label: "Threats or violence", section: "threats-violence",
    description: "Threatening, encouraging or glorifying harm to people." },
  { id: "sexual_content", label: "Sexual content", section: "sexual-content",
    description: "Explicit material, sexual harassment or sexual exploitation." },
  { id: "child_safety", label: "Child safety", section: "child-safety",
    description: "Any sexual content involving a minor, or anything that puts a child at risk." },
  { id: "scam_fraud", label: "Scam or fraud", section: "fraud-scams",
    description: "Deceiving people to take their money, data or accounts." },
  { id: "spam", label: "Spam", section: "spam-abuse",
    description: "Repetitive, unwanted or automated promotion and links." },
  { id: "impersonation", label: "Impersonation or fake account", section: "impersonation",
    description: "Pretending to be someone else, or running a deceptive account." },
  { id: "privacy_violation", label: "Privacy violation", section: "privacy-doxxing",
    description: "Sharing someone's private information or private conversations without consent." },
  { id: "copyright", label: "Copyright", section: "copyright-ip",
    description: "Sharing work you do not have the right to share." },
  { id: "academic_misconduct", label: "Academic misconduct", section: "academic-integrity",
    description: "Cheating, selling assignments or leaking exams." },
  { id: "illegal_activity", label: "Illegal activity", section: "illegal-goods",
    description: "Illegal goods or services, gambling or dangerous activities." },
  { id: "self_harm_concern", label: "Safety or self-harm concern", section: "dangerous-activities",
    description: "Someone may be in danger or at risk of hurting themselves." },
  { id: "misinformation", label: "Harmful misinformation", section: "misinformation",
    description: "Deliberately false information that could cause real harm." },
  { id: "other", label: "Something else", section: null,
    description: "A concern that does not fit the other categories." },
];
const CATEGORY_IDS = CATEGORIES.map((c) => c.id);

// ---------------------------------------------------------------- reportable content
// Every user-generated object that can be reported. Each is resolved to a model and owner
// field by the moderation service (the owner field is not uniform across the codebase:
// userId, senderId, createdBy, uploadedBy).
const ENTITY_TYPES = [
  { id: "profile", label: "Profile" },
  { id: "post", label: "Post" },
  { id: "comment", label: "Comment" },
  { id: "video", label: "Video" },
  { id: "media", label: "Photo or file" },
  { id: "message", label: "Message" },
  { id: "community", label: "Community" },
  { id: "event", label: "Event" },
  { id: "discussion", label: "Course discussion post" },
  { id: "note", label: "Course note" },
  { id: "past_paper", label: "Past paper" },
  { id: "library_resource", label: "Library resource" },
];
const ENTITY_TYPE_IDS = ENTITY_TYPES.map((e) => e.id);

// ---------------------------------------------------------------- severity
const SEVERITIES = ["P0", "P1", "P2", "P3"];
const SEVERITY_META = {
  P0: { label: "Critical", targetHours: 1 },
  P1: { label: "Severe", targetHours: 4 },
  P2: { label: "Significant", targetHours: 24 },
  P3: { label: "Ordinary", targetHours: 72 },
};
const DEFAULT_SEVERITY = {
  child_safety: "P0",
  threats_violence: "P1",
  self_harm_concern: "P1",
  sexual_content: "P2",
  hate_speech: "P2",
  harassment: "P2",
  scam_fraud: "P2",
  impersonation: "P2",
  privacy_violation: "P2",
  illegal_activity: "P2",
  copyright: "P3",
  academic_misconduct: "P3",
  spam: "P3",
  misinformation: "P3",
  other: "P3",
};

// Child-safety reports are ALWAYS critical. A credible imminent threat (or imminent risk of
// self-harm) is critical too, but the reporter's "imminent" flag is only a claim, so it sets
// the queue priority and a moderator confirms it; it never triggers punishment by itself.
function severityFor({ category, imminent }) {
  const base = DEFAULT_SEVERITY[category];
  if (!base) throw new Error(`Unknown category: ${category}`);
  if (category === "child_safety") return { severity: "P0", reason: "child_safety_always_critical" };
  if (imminent === true && (category === "threats_violence" || category === "self_harm_concern")) {
    return { severity: "P0", reason: "imminent_danger_reported" };
  }
  return { severity: base, reason: "category_default" };
}

// Review TARGETS (not promises): the dashboard flags reports that go past them.
function dueAtFor(severity, from = new Date()) {
  const meta = SEVERITY_META[severity];
  if (!meta) throw new Error(`Unknown severity: ${severity}`);
  return new Date(new Date(from).getTime() + meta.targetHours * 3600 * 1000);
}

// ---------------------------------------------------------------- statuses & outcomes
const REPORT_STATUSES = ["open", "in_review", "escalated", "resolved", "dismissed"];
const OPEN_STATUSES = ["open", "in_review", "escalated"];
const RESOLUTION_OUTCOMES = ["violation_confirmed", "no_violation", "duplicate", "insufficient_info", "bad_faith"];

// What the REPORTER is told. Deliberately vague: it never reveals what happened to the
// reported person, and never tells a reporter they were judged to be acting in bad faith.
function outcomeForReporter(report) {
  if (!report) return "Received";
  if (report.status === "open") return "Received";
  if (report.status === "in_review" || report.status === "escalated") return "Under review";
  const outcome = report.resolution && report.resolution.outcome;
  if (outcome === "violation_confirmed") return "Action was taken";
  if (outcome === "no_violation") return "No violation found";
  if (outcome === "duplicate") return "Already being handled";
  return "Closed";
}

// ---------------------------------------------------------------- enforcement
const ENFORCEMENT_ACTIONS = [
  "warning",
  "content_removal",
  "feature_restriction",
  "temporary_suspension",
  "permanent_termination",
];
const RESTRICTABLE_FEATURES = ["posting", "commenting", "messaging", "communities", "uploads", "reporting"];
const MAX_SUSPENSION_DAYS = 90;
const MAX_RESTRICTION_DAYS = 90;

// Who may impose what. Community moderators act only inside their own community (handled
// separately by community membership roles); these are the PLATFORM-level rules.
//   superadmin: everything.
//   admin: everything except termination, which is reserved for severe (P0/P1) cases where
//          waiting for a superadmin could leave people at risk. Every use is audited and appealable.
function canEnforce({ role, action, severity }) {
  if (!ENFORCEMENT_ACTIONS.includes(action)) return { ok: false, reason: "unknown_action" };
  if (role === "superadmin") return { ok: true };
  if (role === "admin") {
    if (action === "permanent_termination" && !(severity === "P0" || severity === "P1")) {
      return { ok: false, reason: "termination_requires_severe_case_or_superadmin" };
    }
    return { ok: true };
  }
  return { ok: false, reason: "not_a_platform_moderator" };
}

// ---------------------------------------------------------------- account standing
// Used by the auth middleware on EVERY request. Before this existed, "suspended" was only
// a label: nothing in the login or request path ever read it.
function accountBlock(user, now = new Date()) {
  if (!user) return { code: "ACCOUNT_NOT_FOUND", message: "Account not found." };
  if (user.deletedAt) return { code: "ACCOUNT_DELETED", message: "This account has been deleted." };
  if (user.status === "terminated") {
    return {
      code: "ACCOUNT_TERMINATED",
      message: "This account was permanently closed for breaking the UniLink Community Standards. You can appeal this decision.",
      appealable: true,
    };
  }
  if (user.status === "suspended") {
    const until = user.suspendedUntil ? new Date(user.suspendedUntil) : null;
    if (until && until.getTime() <= new Date(now).getTime()) return null; // temporary suspension has ended
    return {
      code: "ACCOUNT_SUSPENDED",
      message: until
        ? "Your account is temporarily suspended for breaking the UniLink Community Standards. You can appeal this decision."
        : "Your account is suspended. You can appeal this decision.",
      until: until ? until.toISOString() : null,
      appealable: true,
    };
  }
  return null;
}

function activeRestrictions(user, now = new Date()) {
  const list = (user && user.restrictions) || [];
  const t = new Date(now).getTime();
  return list.filter((r) => !r.until || new Date(r.until).getTime() > t);
}

function isRestricted(user, feature, now = new Date()) {
  return activeRestrictions(user, now).some((r) => r.feature === feature);
}

// ---------------------------------------------------------------- appeals
const APPEAL_WINDOW_DAYS = 30;
const APPEAL_STATUSES = ["pending", "under_review", "upheld", "overturned", "reduced"];

function appealEligibility({ action, existingAppeal, now = new Date() }) {
  if (!action) return { ok: false, reason: "action_not_found" };
  if (action.status === "overturned") return { ok: false, reason: "already_overturned" };
  if (existingAppeal) return { ok: false, reason: "already_appealed" };
  const ageMs = new Date(now).getTime() - new Date(action.createdAt).getTime();
  if (ageMs > APPEAL_WINDOW_DAYS * 86400 * 1000) return { ok: false, reason: "appeal_window_closed" };
  return { ok: true };
}

// An appeal must be decided by someone who did NOT impose the original action.
function canReviewAppeal({ reviewerId, reviewerRole, action }) {
  if (reviewerRole !== "admin" && reviewerRole !== "superadmin") return { ok: false, reason: "not_a_platform_moderator" };
  if (action && String(action.moderatorId) === String(reviewerId)) return { ok: false, reason: "reviewer_must_be_independent" };
  return { ok: true };
}

// ---------------------------------------------------------------- abuse prevention
const REPORT_LIMITS = { perHour: 10, perDay: 30, descriptionMax: 1000 };

// Child-safety and imminent-danger reports get double headroom: a flood of ordinary reports
// must never be able to block an emergency.
function reportThrottle({ lastHourCount, lastDayCount, category, imminent }) {
  const boost = category === "child_safety" || imminent === true ? 2 : 1;
  if (lastHourCount >= REPORT_LIMITS.perHour * boost) return { limited: true, retryAfterMinutes: 60 };
  if (lastDayCount >= REPORT_LIMITS.perDay * boost) return { limited: true, retryAfterMinutes: 24 * 60 };
  return { limited: false };
}

function sanitizeDescription(text) {
  if (typeof text !== "string") return "";
  return text
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F\u007F]/g, "") // control characters
    .replace(/\n{4,}/g, "\n\n\n")
    .trim()
    .slice(0, REPORT_LIMITS.descriptionMax);
}

// Short, human-friendly receipt code. No 0/O/1/I so it can be read out over the phone.
function referenceCode() {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let out = "RPT-";
  for (let i = 0; i < 8; i++) out += alphabet[crypto.randomInt(alphabet.length)];
  return out;
}

const OBJECT_ID_RE = /^[a-f0-9]{24}$/i;
const isObjectIdLike = (v) => typeof v === "string" && OBJECT_ID_RE.test(v);

module.exports = {
  CATEGORIES, CATEGORY_IDS, ENTITY_TYPES, ENTITY_TYPE_IDS,
  SEVERITIES, SEVERITY_META, DEFAULT_SEVERITY, severityFor, dueAtFor,
  REPORT_STATUSES, OPEN_STATUSES, RESOLUTION_OUTCOMES, outcomeForReporter,
  ENFORCEMENT_ACTIONS, RESTRICTABLE_FEATURES, MAX_SUSPENSION_DAYS, MAX_RESTRICTION_DAYS, canEnforce,
  accountBlock, activeRestrictions, isRestricted,
  APPEAL_WINDOW_DAYS, APPEAL_STATUSES, appealEligibility, canReviewAppeal,
  REPORT_LIMITS, reportThrottle, sanitizeDescription, referenceCode, isObjectIdLike,
};
