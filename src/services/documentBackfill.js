"use strict";

// Renders page images for documents that have none: posts made before page rendering existed, and
// renders that failed. Runs by itself in the background (jobs/documentBackfillJob.js), one document at
// a time, so nobody has to run anything by hand and a failed render is retried (up to 3 attempts).
//
// Dependencies are injected so the logic is unit-tested without a database, Cloudinary or LibreOffice
// (tests/documentBackfill.test.js). services/documentBackfill.instance.js wires the real ones.

const PDF = "application/pdf";
const DOC = "application/msword";
const DOCX = "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
const PPTX = "application/vnd.openxmlformats-officedocument.presentationml.presentation";
const XLSX = "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet";
const PPT = "application/vnd.ms-powerpoint";
const XLS = "application/vnd.ms-excel";
const BY_EXTENSION = { pdf: PDF, doc: DOC, docx: DOCX, ppt: PPT, pptx: PPTX, xls: XLS, xlsx: XLSX };
const MAX_BYTES = 25 * 1024 * 1024;

// Old posts do not record a mime type, so work it out: what the file really is (its first bytes)
// beats what its name claims.
function inferMimeType({ mimeType, originalName, url, buffer, isSupported }) {
  if (mimeType && isSupported(mimeType)) return mimeType;
  if (buffer && buffer.length >= 5) {
    if (buffer.subarray(0, 5).toString("latin1") === "%PDF-") return PDF;
    if (buffer[0] === 0xd0 && buffer[1] === 0xcf && buffer[2] === 0x11 && buffer[3] === 0xe0) {
      const ext = String(originalName || url || "").split(".").pop().toLowerCase();
      return BY_EXTENSION[ext] && ["doc", "ppt", "xls"].includes(ext) ? BY_EXTENSION[ext] : DOC;
    }
  }
  const ext = String(originalName || url || "").split("?")[0].split(".").pop().toLowerCase();
  return BY_EXTENSION[ext] || null;
}

// Does this attachment still need its pages made?
function needsRender(media, post, { now, maxAttempts, stuckMinutes }) {
  if (!media || media.type !== "document") return false;
  if ((media.renderAttempts || 0) >= maxAttempts) return false;
  if (media.pageCount > 0 && (media.pages || []).length > 0) return false;
  if (media.processingStatus === "pending") {
    // A render that was started and never finished (the server restarted mid-way).
    return new Date(post.createdAt).getTime() < new Date(now).getTime() - stuckMinutes * 60000;
  }
  return true;
}

function createDocumentBackfill({
  Post, render, uploadPage, isSupported, fetchImpl = globalThis.fetch, signedUrlFor = null,
  now = () => new Date(), maxAttempts = 3, stuckMinutes = 30, log = console,
}) {
  async function download(media) {
    const get = async (url) => {
      const ctl = new AbortController();
      const timer = setTimeout(() => ctl.abort(), 60000);
      try { return await fetchImpl(url, { signal: ctl.signal }); } finally { clearTimeout(timer); }
    };
    let res = await get(media.url);
    // Some Cloudinary accounts refuse public delivery of PDFs; a signed download link gets around that.
    if (!res.ok && [401, 403, 404].includes(res.status) && signedUrlFor && media.publicId) {
      const signed = signedUrlFor(media.publicId);
      if (signed) res = await get(signed);
    }
    if (!res.ok) throw new Error(`download failed (${res.status})`);
    const len = Number(res.headers && res.headers.get ? res.headers.get("content-length") : 0);
    if (len > MAX_BYTES) throw new Error("file too large");
    const buffer = Buffer.from(await res.arrayBuffer());
    if (buffer.length > MAX_BYTES) throw new Error("file too large");
    return buffer;
  }

  // Which posts might need work. The real query; tests do not run it (no database), but
  // tests/documentBackfill.test.js checks that Mongoose accepts it.
  function candidateQuery(t = now()) {
    const open = { $not: { $gte: maxAttempts } };
    return {
      $or: [
        { media: { $elemMatch: { type: "document", processingStatus: { $in: ["ready", "failed"] }, pageCount: { $in: [0, null] }, renderAttempts: open } } },
        {
          createdAt: { $lt: new Date(new Date(t).getTime() - stuckMinutes * 60000) },
          media: { $elemMatch: { type: "document", processingStatus: "pending", renderAttempts: open } },
        },
      ],
    };
  }

  async function processOne(post, media) {
    const key = { _id: post._id, "media.publicId": media.publicId };
    await Post.updateOne(key, { $set: { "media.$.processingStatus": "pending" }, $inc: { "media.$.renderAttempts": 1 } });
    try {
      const buffer = await download(media);
      const mimeType = inferMimeType({ mimeType: media.mimeType, originalName: media.originalName, url: media.url, buffer, isSupported });
      if (!mimeType || !isSupported(mimeType)) throw new Error("not a supported document type");
      const rendered = await render(buffer, mimeType, media.originalName || "document");
      const pages = [];
      for (const p of rendered.pages) {
        // The same folder naming createPost uses, so old and new documents are stored alike.
        const key = String(media.publicId).replace(/[^a-zA-Z0-9_-]/g, "_");
        const up = await uploadPage(p.buffer, `unilink/posts/document-pages/${key}`);
        pages.push({ page: p.page, url: up.secure_url || up.url, publicId: up.public_id });
      }
      await Post.updateOne(key, { $set: { "media.$.pageCount": rendered.pageCount, "media.$.pages": pages, "media.$.processingStatus": "ready", "media.$.mimeType": mimeType } });
      return "rendered";
    } catch (err) {
      log.error(`[documents] could not render ${media.publicId}: ${err && err.message}`);
      await Post.updateOne(key, { $set: { "media.$.processingStatus": "failed" } });
      return "failed";
    }
  }

  // One batch. Documents are handled one at a time: LibreOffice is heavy for a small server.
  async function runOnce({ limit = 1 } = {}) {
    const t = now();
    const posts = await Post.find(candidateQuery(t)).limit(limit).lean();
    const out = { rendered: 0, failed: 0 };
    for (const post of posts) {
      for (const media of post.media || []) {
        if (!needsRender(media, post, { now: t, maxAttempts, stuckMinutes })) continue;
        const r = await processOne(post, media);
        out[r]++;
      }
    }
    return out;
  }

  return { runOnce, candidateQuery, needsRender: (m, p) => needsRender(m, p, { now: now(), maxAttempts, stuckMinutes }) };
}

module.exports = { createDocumentBackfill, inferMimeType };
