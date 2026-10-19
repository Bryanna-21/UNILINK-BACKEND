"use strict";

// Once an hour: end penalties whose time is up and let unapproved account closures lapse.
// Never throws, never keeps the process alive on its own.
const SIX_MINUTES = 6 * 60 * 1000;
const EVERY = 60 * 60 * 1000;

function start() {
  const service = require("../services/enforcement.instance");
  const run = async () => {
    try {
      const r = await service.sweepExpired();
      if (r.ended || r.lapsed) console.log(`[enforcement] sweep: ${r.ended} ended, ${r.lapsed} lapsed`);
    } catch (e) {
      console.error("[enforcement] sweep failed:", e && e.message);
    }
  };
  setTimeout(run, SIX_MINUTES).unref();
  setInterval(run, EVERY).unref();
}

module.exports = { start };
