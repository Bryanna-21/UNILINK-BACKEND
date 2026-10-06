"use strict";

// The wired-up service the controller imports. Env switches are read once at start-up.
const { createUnitsCore } = require("./units.core");
const repo = require("./units.repo");
const { flag } = require("../utils/config.rules");

module.exports = createUnitsCore({
  repo,
  config: {
    enforceAccess: flag(process.env.COURSES_ENFORCE_ACCESS, true),
    exposeEnrolmentIds: flag(process.env.COURSES_EXPOSE_ENROLMENT_IDS, false),
    unitEnrolmentEnabled: flag(process.env.FEATURE_UNIT_ENROLMENT, true),
  },
});
