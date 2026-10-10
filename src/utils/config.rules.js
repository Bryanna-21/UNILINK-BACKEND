"use strict";

// Public, non-sensitive switches the app reads at start-up. An over-the-air update reaches every
// phone at once and build-time env values can't change after that, so this is the quick way to
// turn a feature off without a new release: set the env var on Render and redeploy.
//
//   FEATURE_ONBOARDING=false        hides the first-run setup card
//   FEATURE_UNIT_ENROLMENT=false    stops enrol/unenrol on the server too
//   FEATURE_CALLS / FEATURE_DOCUMENTS   off by default until those features exist
//
// App update gate (read by the mobile app at launch, no redeploy of code needed):
//   APP_LATEST_VERSION=0.2.0   newest installable version; older apps see a dismissible banner
//   APP_MIN_VERSION=0.1.5      apps older than this must update (full-screen). Use rarely.
//   APP_DOWNLOAD_URL=https://...   where the new APK lives. https only, anything else is ignored.
//   APP_UPDATE_MESSAGE=...     optional short note shown with the prompt (200 characters max)

const { MAX_ENROLLED_UNITS } = require("./units.rules");

const flag = (value, fallback) =>
  value === undefined || value === "" ? fallback : !/^(0|false|off|no)$/i.test(String(value).trim());

const cleanVersion = (value) => {
  const s = String(value ?? "").trim();
  return /^\d+(\.\d+){0,2}$/.test(s) ? s : null;
};
// The app opens this link, so only https is accepted; a typo or a different scheme becomes null.
const cleanUrl = (value) => {
  const s = String(value ?? "").trim();
  return /^https:\/\/[^\s]+$/.test(s) ? s : null;
};

function buildApp(env) {
  return {
    latestVersion: cleanVersion(env.APP_LATEST_VERSION),
    minVersion: cleanVersion(env.APP_MIN_VERSION),
    downloadUrl: cleanUrl(env.APP_DOWNLOAD_URL),
    message: String(env.APP_UPDATE_MESSAGE ?? "").trim().slice(0, 200) || null,
  };
}

function buildConfig(env = {}) {
  return {
    version: 1,
    features: {
      onboarding: flag(env.FEATURE_ONBOARDING, true),
      unitEnrolment: flag(env.FEATURE_UNIT_ENROLMENT, true),
      calls: flag(env.FEATURE_CALLS, false),
      documents: flag(env.FEATURE_DOCUMENTS, false),
    },
    limits: { maxUnits: MAX_ENROLLED_UNITS },
    app: buildApp(env),
  };
}

module.exports = { buildConfig, flag, cleanVersion, cleanUrl };
