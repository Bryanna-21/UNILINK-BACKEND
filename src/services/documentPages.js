"use strict";

// Renders a document and saves its page images ON THE POST a few at a time, so the first page can be
// shown while the rest are still being drawn (a long document used to show only its file name until
// every page was done, or forever if one step timed out).
//
// Used by createPost (right after a document is posted) and by the background backfill. The renderer,
// the uploader and the Post model are injected, so this is unit-tested without a database, Cloudinary or
// LibreOffice (tests/documentPages.test.js). Never throws: it reports { status, pageCount }.
//
// Pages already saved are kept when a later step fails, so a reader still sees them.

const { mapWithLimit } = require("../utils/mapWithLimit");

async function renderAndStorePages({
  Post,
  postId,
  publicId,
  buffer,
  mimeType,
  originalName,
  render,
  uploadPage,
  extraSet = {},
  log = console,
  uploadsAtOnce = 4,
}) {
  const filter = { _id: postId, "media.publicId": publicId };
  const folder = `unilink/posts/document-pages/${String(publicId).replace(/[^a-zA-Z0-9_-]/g, "_")}`;
  let stored = 0;

  async function save({ pages, pageCount, totalPages }) {
    const uploaded = await mapWithLimit(pages, uploadsAtOnce, async (p) => {
      const up = await uploadPage(p.buffer, folder);
      return { page: p.page, url: up.secure_url || up.url, publicId: up.public_id };
    });
    await Post.updateOne(filter, {
      $push: { "media.$.pages": { $each: uploaded } },
      $set: { "media.$.pageCount": pageCount, "media.$.totalPages": totalPages || pageCount },
    });
    stored += uploaded.length;
  }

  try {
    // A fresh start: a retry must not stack new pages on top of an earlier attempt's pages.
    await Post.updateOne(filter, { $set: { "media.$.pages": [], "media.$.pageCount": 0 } });

    const rendered = await render(buffer, mimeType, originalName || "document", { onChunk: save });

    // A renderer that hands everything back at the end instead of in chunks still works.
    if (stored === 0 && rendered && Array.isArray(rendered.pages) && rendered.pages.length) {
      await save({ pages: rendered.pages, pageCount: rendered.pageCount || rendered.pages.length, totalPages: rendered.pageCount });
    }
    if (stored === 0) throw new Error("Document produced no renderable pages");

    await Post.updateOne(filter, { $set: { "media.$.processingStatus": "ready", ...extraSet } });
    return { status: "ready", pageCount: stored };
  } catch (err) {
    log.error(`[documents] could not render ${publicId}: ${err && err.message}`);
    try {
      await Post.updateOne(filter, { $set: { "media.$.processingStatus": "failed" } });
    } catch (e) {
      log.error(`[documents] could not mark ${publicId} as failed: ${e && e.message}`);
    }
    return { status: "failed", pageCount: stored };
  }
}

module.exports = { renderAndStorePages };
