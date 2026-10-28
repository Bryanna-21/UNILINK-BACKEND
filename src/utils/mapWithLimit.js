"use strict";

// Like Promise.all(items.map(fn)), but never runs more than `limit` calls at once, and keeps the
// results in the same order as the items. If any call fails, the returned promise rejects with
// that error and no further items are started.
//
// Used for uploading a document's page images: a 60-page PDF used to start 60 uploads at the
// same moment, which can hit the image host's rate limits and fail the whole document.
async function mapWithLimit(items, limit, fn) {
  const list = Array.from(items);
  const results = new Array(list.length);
  const workers = Math.max(1, Math.min(Number(limit) || 1, list.length));
  let next = 0;
  let failed = false;

  async function worker() {
    while (!failed) {
      const i = next;
      next += 1;
      if (i >= list.length) return;
      try {
        results[i] = await fn(list[i], i);
      } catch (error) {
        failed = true;
        throw error;
      }
    }
  }

  await Promise.all(Array.from({ length: workers }, worker));
  return results;
}

module.exports = { mapWithLimit };
