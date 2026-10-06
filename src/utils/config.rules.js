"use strict";

// Public, non-sensitive switches the app reads at start-up. An over-the-air update reaches every
// phone at once and build-time env values can't change after that, so this is the quick way to
// turn a feature off without a new release: set the env var on Render and redeploy.
//
//   FEATURE_ONBOARDING=false        hides the first-run setup card
//   FEATURE_UNIT_ENROLMENT=false    stops enrol/unenrol on the server too
//   FEATURE_CALLS / FEATURE_DOCUMENTS   off by default until those features exist

const { MAX_ENROLLED_UNITS } = require("./units.rules");

const flag = (value, fallback) =>
  value === undefined || value === "" ? fallback : !/^(0|false|off|no)$/i.test(String(value).trim());

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
  };
}

module.exports = { buildConfig, flag };
