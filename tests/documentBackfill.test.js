"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { createDocumentBackfill, inferMimeType } = require("../src/services/documentBackfill");

const NOW = new Date("2026-10-23T12:00:00Z");
const SUPPORTED = new Set(["application/pdf", "application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"]);
const isSupported = (m) => SUPPORTED.has(m);
const pdfBuffer = Buffer.from("%PDF-1.4 fake");
const silent = { error: () => {} };

// A fake Post collection that understands the two update shapes the backfill uses.
function makePosts(posts) {
  const docs = posts.map((p) => structuredClone(p));
  return {
    docs,
    find: () => ({ limit: () => ({ lean: async () => docs.map((d) => structuredClone(d)) }) }),
    updateOne: async (filter, update) => {
      const post = docs.find((d) => String(d._id) === String(filter._id));
      const media = post && post.media.find((m) => m.publicId === filter["media.publicId"]);
      if (!media) return { modifiedCount: 0 };
      for (const [k, v] of Object.entries(update.$set || {})) media[k.replace("media.$.", "")] = structuredClone(v);
      for (const [k, v] of Object.entries(update.$inc || {})) media[k.replace("media.$.", "")] = (media[k.replace("media.$.", "")] || 0) + v;
      return { modifiedCount: 1 };
    },
  };
}
const docPost = (media = {}, extra = {}) => ({
  _id: "p1", createdAt: new Date("2026-09-01T00:00:00Z"),
  media: [{ type: "document", publicId: "unilink/posts/abc.pdf", url: "https://x/abc.pdf", originalName: "notes.pdf", pageCount: 0, pages: [], processingStatus: "ready", ...media }],
  ...extra,
});
function service(Post, over = {}) {
  const uploads = [];
  const svc = createDocumentBackfill({
    Post, isSupported, log: silent, now: () => NOW,
    fetchImpl: over.fetchImpl || (async () => ({ ok: true, status: 200, headers: { get: () => String(pdfBuffer.length) }, arrayBuffer: async () => pdfBuffer })),
    render: over.render || (async () => ({ pageCount: 2, pages: [{ page: 1, buffer: Buffer.from("a") }, { page: 2, buffer: Buffer.from("b") }] })),
    uploadPage: over.uploadPage || (async (buf, folder) => { uploads.push(folder); return { secure_url: `https://img/${uploads.length}.jpg`, public_id: `pg${uploads.length}` }; }),
    signedUrlFor: over.signedUrlFor || null,
  });
  return { svc, uploads };
}

test("an old document with no pages gets rendered, uploaded and marked ready", async () => {
  const Post = makePosts([docPost()]);
  const { svc, uploads } = service(Post);
  assert.deepEqual(await svc.runOnce(), { rendered: 1, failed: 0 });
  const m = Post.docs[0].media[0];
  assert.equal(m.processingStatus, "ready");
  assert.equal(m.pageCount, 2);
  assert.deepEqual(m.pages.map((p) => p.page), [1, 2]);
  assert.equal(m.pages[0].url, "https://img/1.jpg");
  assert.equal(m.mimeType, "application/pdf");
  assert.equal(uploads[0], "unilink/posts/document-pages/unilink_posts_abc_pdf"); // same naming as new posts
  assert.equal(m.renderAttempts, 1);
});

test("a document that already has pages is left alone", async () => {
  const Post = makePosts([docPost({ pageCount: 3, pages: [{ page: 1, url: "u" }] })]);
  const { svc } = service(Post);
  assert.deepEqual(await svc.runOnce(), { rendered: 0, failed: 0 });
});

test("a failed render is marked failed and counted as an attempt", async () => {
  const Post = makePosts([docPost()]);
  const { svc } = service(Post, { render: async () => { throw new Error("libreoffice crashed"); } });
  assert.deepEqual(await svc.runOnce(), { rendered: 0, failed: 1 });
  assert.equal(Post.docs[0].media[0].processingStatus, "failed");
  assert.equal(Post.docs[0].media[0].renderAttempts, 1);
});

test("it gives up after three attempts", async () => {
  const Post = makePosts([docPost({ processingStatus: "failed", renderAttempts: 3 })]);
  const { svc } = service(Post);
  assert.deepEqual(await svc.runOnce(), { rendered: 0, failed: 0 });
});

test("a render stuck on pending is retried only after 30 minutes", async () => {
  const fresh = makePosts([docPost({ processingStatus: "pending" }, { createdAt: new Date(NOW.getTime() - 5 * 60000) })]);
  assert.deepEqual(await service(fresh).svc.runOnce(), { rendered: 0, failed: 0 });
  const stuck = makePosts([docPost({ processingStatus: "pending" }, { createdAt: new Date(NOW.getTime() - 60 * 60000) })]);
  assert.deepEqual(await service(stuck).svc.runOnce(), { rendered: 1, failed: 0 });
});

test("a refused public download falls back to a signed link", async () => {
  const calls = [];
  const fetchImpl = async (url) => {
    calls.push(url);
    return url.includes("signed") ? { ok: true, status: 200, headers: { get: () => "13" }, arrayBuffer: async () => pdfBuffer } : { ok: false, status: 401 };
  };
  const Post = makePosts([docPost()]);
  const { svc } = service(Post, { fetchImpl, signedUrlFor: () => "https://api/signed-download" });
  assert.deepEqual(await svc.runOnce(), { rendered: 1, failed: 0 });
  assert.deepEqual(calls, ["https://x/abc.pdf", "https://api/signed-download"]);
});

test("a download that fails both ways is a failure, not a crash", async () => {
  const Post = makePosts([docPost()]);
  const { svc } = service(Post, { fetchImpl: async () => ({ ok: false, status: 404 }), signedUrlFor: () => "https://api/signed" });
  assert.deepEqual(await svc.runOnce(), { rendered: 0, failed: 1 });
});

test("something that is not a document is a failure", async () => {
  const Post = makePosts([docPost({ originalName: "x.bin", url: "https://x/x.bin" })]);
  const { svc } = service(Post, { fetchImpl: async () => ({ ok: true, status: 200, headers: { get: () => "4" }, arrayBuffer: async () => Buffer.from("junk") }) });
  assert.deepEqual(await svc.runOnce(), { rendered: 0, failed: 1 });
});

test("a file that is too large is refused before it is read", async () => {
  const Post = makePosts([docPost()]);
  const { svc } = service(Post, { fetchImpl: async () => ({ ok: true, status: 200, headers: { get: () => String(99 * 1024 * 1024) }, arrayBuffer: async () => { throw new Error("should not read"); } }) });
  assert.deepEqual(await svc.runOnce(), { rendered: 0, failed: 1 });
});

test("mime type: what the file really is beats what its name says", () => {
  const args = { isSupported };
  assert.equal(inferMimeType({ ...args, buffer: Buffer.from("%PDF-1.7"), originalName: "report.docx" }), "application/pdf");
  assert.equal(inferMimeType({ ...args, mimeType: "application/msword", buffer: null }), "application/msword");
  assert.equal(inferMimeType({ ...args, originalName: "slides.pptx", buffer: Buffer.from("PK\u0003\u0004") }), "application/vnd.openxmlformats-officedocument.presentationml.presentation");
  assert.equal(inferMimeType({ ...args, originalName: "notes.txt", buffer: Buffer.from("hello world") }), null);
});

test("the candidate query is accepted by Mongoose", () => {
  let mongoose;
  try { mongoose = require("mongoose"); } catch { return; } // not installed: nothing to check
  const Post = require("../src/models/Post");
  const { svc } = service(makePosts([]));
  const q = Post.find(svc.candidateQuery(NOW));
  q._castConditions();
  assert.ok(!q.error());
});
