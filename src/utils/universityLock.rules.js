"use strict";

// Pure rule for who may change a user's university through PUT /profile/me.
// No database in here: everything is unit-tested (tests/universityLock.rules.test.js).
//
// Why it exists: universityId decides which posts, comments, communities and people a user can see
// (and, for staff, which campus they administer). If anyone could rewrite it at any time, every
// isolation rule on the platform could be bypassed by one request.
//
// The rule:
//   - A university is always required. It can never be cleared.
//   - Sending the university you already have is harmless and ignored (clients resend it).
//   - Only students may change it, and only until academic setup is finished. Setup is the one
//     moment the app asks "which university?", so the app's own flow keeps working.
//   - Lecturers, admins and superadmins never change it here. An administrator assigns it.

const isObjectId = (v) => /^[a-f0-9]{24}$/i.test(String(v ?? ""));

// Mirrors the mobile app's own definition of "setup finished" (app/index.tsx setupDone), so legacy
// accounts that finished before onboardingCompletedAt existed are locked as well.
function isSetupFinished(user) {
  if (!user) return false;
  return Boolean(user.onboardingCompletedAt || (user.programme && user.yearOfStudy && user.semester));
}

const refuse = (status, message) => ({ ok: false, status, message });

// user: { role, universityId, onboardingCompletedAt, programme, yearOfStudy, semester }
// requested: whatever the client sent as universityId.
// Returns { ok: true, change: false } (nothing to do), { ok: true, change: true, value },
// or { ok: false, status, message }. A returned change still needs the university to exist.
function decideUniversityChange(user, requested) {
  if (typeof requested !== "string") return refuse(400, "University ID must be text.");
  const value = requested.trim();
  if (!value) return refuse(400, "A university is required.");
  if (value.length > 100) return refuse(400, "University ID is invalid.");

  const current = String(user?.universityId ?? "").trim();
  if (value === current) return { ok: true, change: false };

  if (!isObjectId(value)) return refuse(400, "University ID is invalid.");

  if (!user || user.role !== "student") {
    return refuse(403, "Your university is assigned by an administrator and can't be changed here.");
  }
  if (isSetupFinished(user)) {
    return refuse(403, "Your university is locked once your academic setup is complete. Contact an administrator to change it.");
  }
  return { ok: true, change: true, value };
}

module.exports = { decideUniversityChange, isSetupFinished, isObjectId };
