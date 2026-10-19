"use strict";

// The real, wired-up enforcement service (real models, real notifier). Shared by the HTTP
// controller and the background sweep so both use exactly the same logic.
const { createEnforcementService } = require("./enforcement.service");

module.exports = createEnforcementService({
  models: {
    User: require("../models/User"),
    ContentReport: require("../models/ContentReport"),
    ModerationAction: require("../models/ModerationAction"),
    Appeal: require("../models/Appeal"),
    AuditLog: require("../models/AuditLog"),
  },
  notifier: require("./enforcement.notify"),
  contentRemover: require("./contentRemover"),
});
