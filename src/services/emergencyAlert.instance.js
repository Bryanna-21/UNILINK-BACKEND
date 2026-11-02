"use strict";

// The real wiring for emergencyAlert.service.js. Everything is required on first use, so loading
// this file (and therefore emergency.controller.js) never touches a model or the socket server
// at import time.

const { createEmergencyAlerts } = require("./emergencyAlert.service");

let instance = null;

function real() {
  if (!instance) {
    const { sendPushBatch, isExpoToken } = require("../utils/pushBatch");
    instance = createEmergencyAlerts({
      User: require("../models/User"),
      Notification: require("../models/Notification"),
      sendPushBatch,
      isExpoToken,
      emitToUsers: (...args) => require("../socket").emitToUsers(...args),
    });
  }
  return instance;
}

module.exports = {
  alertAdmins: (args) => real().alertAdmins(args),
};
