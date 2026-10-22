"use strict";

// Every 15 minutes, render page images for ONE document that has none (old posts, failed renders).
// Never throws, never keeps the process alive by itself, never runs two at once.
const FIRST_RUN = 4 * 60 * 1000;
const EVERY = 15 * 60 * 1000;

function start() {
  let running = false;
  const run = async () => {
    if (running) return;
    running = true;
    try {
      const r = await require("../services/documentBackfill.instance").runOnce({ limit: 1 });
      if (r.rendered || r.failed) console.log(`[documents] backfill: ${r.rendered} rendered, ${r.failed} failed`);
    } catch (e) {
      console.error("[documents] backfill run failed:", e && e.message);
    } finally {
      running = false;
    }
  };
  setTimeout(run, FIRST_RUN).unref();
  setInterval(run, EVERY).unref();
}

module.exports = { start };
