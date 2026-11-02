"use strict";

// The real wiring for call.service.js. Everything is required on first use, so loading this file
// never touches a model or the network at import time.

const { createCallService } = require("./call.service");

let instance = null;

function real() {
  if (!instance) {
    const mongoose = require("mongoose");
    const { sendPushBatch, isExpoToken } = require("../utils/pushBatch");
    const { buildAccessToken, readLiveKitConfig } = require("../utils/livekit.token");
    const { buildConfig } = require("../utils/config.rules");
    const { createGemini } = require("./gemini.service");
    instance = createCallService({
      Call: require("../models/Call"),
      Conversation: require("../models/Conversation"),
      User: require("../models/User"),
      Message: require("../models/Message"),
      AiUsage: require("../models/AiUsage"),
      peopleService: require("./people.service"),
      gemini: createGemini(),
      getConfig: () => buildConfig(process.env),
      getLiveKit: () => readLiveKitConfig(process.env),
      buildAccessToken,
      sendPushBatch,
      isExpoToken,
      newId: () => new mongoose.Types.ObjectId(),
    });
  }
  return instance;
}

module.exports = new Proxy({}, { get: (_t, name) => (...args) => real()[name](...args) });
