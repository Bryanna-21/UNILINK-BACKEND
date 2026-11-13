"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { execFileSync } = require("node:child_process");
const { renderAndStorePages } = require("../src/services/documentPages");

const silent = { error: () => {} };

// A fake Post collection: one post with one document, understanding $set and $push/$each.
function makePost(media = {}) {
  const doc = { _id: "p1", media: [{ publicId: "unilink/posts/big.pdf", type: "document", pageCount: 0, pages: [], processingStatus: "pending", ...media }] };
  return {
    doc,
    updates: [],
    async updateOne(filter, update) {
      const m = doc.media.find((x) => x.publicId === filter["media.publicId"]);
      if (!m || String(filter._id) !== doc._id) return { modifiedCount: 0 };
      for (const [k, v] of Object.entries(update.$set || {})) m[k.replace("media.$.", "")] = structuredClone(v);
      for (const [k, v] of Object.entries(update.$push || {})) {
        const f = k.replace("media.$.", "");
        m[f] = [...(m[f] || []), ...structuredClone(v.$each)];
      }
      this.updates.push(structuredClone(m));
      return { modifiedCount: 1 };
    },
  };
}
const chunkOf = (from, to) => Array.from({ length: to - from + 1 }, (_, i) => ({ page: from + i, buffer: Buffer.from(`p${from + i}`) }));
const uploader = () => {
  const folders = [];
  return { folders, uploadPage: async (buf, folder) => { folders.push(folder); return { secure_url: `https://img/${buf.toString()}.jpg`, public_id: `id-${buf.toString()}` }; } };
};
const run = (Post, render, up, extra = {}) =>
  renderAndStorePages({ Post, postId: "p1", publicId: "unilink/posts/big.pdf", buffer: Buffer.from("x"), mimeType: "application/pdf", originalName: "big.pdf", render, uploadPage: up.uploadPage, log: silent, ...extra });

test("pages are saved chunk by chunk, so page 1 is on the post before the last page exists", async () => {
  const Post = makePost();
  const up = uploader();
  const seenWhenSecondChunkArrives = [];
  const render = async (b, m, n, { onChunk }) => {
    await onChunk({ pages: chunkOf(1, 2), pageCount: 7, totalPages: 7 });
    seenWhenSecondChunkArrives.push(Post.doc.media[0].pages.map((p) => p.page), Post.doc.media[0].processingStatus);
    await onChunk({ pages: chunkOf(3, 7), pageCount: 7, totalPages: 7 });
    return { pageCount: 7, totalPages: 7 };
  };
  const out = await run(Post, render, up);
  assert.deepEqual(out, { status: "ready", pageCount: 7 });
  assert.deepEqual(seenWhenSecondChunkArrives[0], [1, 2], "page 1 and 2 were already readable");
  assert.equal(seenWhenSecondChunkArrives[1], "pending", "and the document was still marked as being prepared");
  const m = Post.doc.media[0];
  assert.deepEqual(m.pages.map((p) => p.page), [1, 2, 3, 4, 5, 6, 7]);
  assert.equal(m.pageCount, 7);
  assert.equal(m.totalPages, 7);
  assert.equal(m.processingStatus, "ready");
  assert.equal(m.pages[0].url, "https://img/p1.jpg");
  assert.equal(up.folders[0], "unilink/posts/document-pages/unilink_posts_big_pdf");
});

test("a long document says how many pages it really has", async () => {
  const Post = makePost();
  const render = async (b, m, n, { onChunk }) => { await onChunk({ pages: chunkOf(1, 3), pageCount: 3, totalPages: 340 }); return {}; };
  await run(Post, render, uploader());
  assert.equal(Post.doc.media[0].pageCount, 3);
  assert.equal(Post.doc.media[0].totalPages, 340);
});

test("if rendering stops part-way, the pages already saved are kept and the document is marked failed", async () => {
  const Post = makePost();
  const render = async (b, m, n, { onChunk }) => {
    await onChunk({ pages: chunkOf(1, 2), pageCount: 9, totalPages: 9 });
    throw new Error("pdftoppm timed out");
  };
  const out = await run(Post, render, uploader());
  assert.deepEqual(out, { status: "failed", pageCount: 2 });
  assert.deepEqual(Post.doc.media[0].pages.map((p) => p.page), [1, 2]);
  assert.equal(Post.doc.media[0].processingStatus, "failed");
});

test("a failed upload also fails the document without throwing", async () => {
  const Post = makePost();
  const render = async (b, m, n, { onChunk }) => { await onChunk({ pages: chunkOf(1, 2), pageCount: 2, totalPages: 2 }); return {}; };
  const out = await run(Post, render, { uploadPage: async () => { throw new Error("cloudinary down"); } });
  assert.equal(out.status, "failed");
  assert.equal(Post.doc.media[0].processingStatus, "failed");
});

test("a renderer that returns every page at the end instead of in chunks still works", async () => {
  const Post = makePost();
  const render = async () => ({ pageCount: 3, pages: chunkOf(1, 3) });
  const out = await run(Post, render, uploader(), { extraSet: { "media.$.mimeType": "application/pdf" } });
  assert.deepEqual(out, { status: "ready", pageCount: 3 });
  assert.equal(Post.doc.media[0].mimeType, "application/pdf");
});

test("a document that produces no pages is a failure", async () => {
  const Post = makePost();
  const out = await run(Post, async () => ({ pageCount: 0, pages: [] }), uploader());
  assert.equal(out.status, "failed");
});

test("a retry starts fresh: pages from an earlier attempt are not stacked underneath the new ones", async () => {
  const Post = makePost({ pageCount: 5, pages: [{ page: 1, url: "old1", publicId: "o1" }, { page: 2, url: "old2", publicId: "o2" }], processingStatus: "failed" });
  const render = async (b, m, n, { onChunk }) => { await onChunk({ pages: chunkOf(1, 2), pageCount: 2, totalPages: 2 }); return {}; };
  await run(Post, render, uploader());
  const m = Post.doc.media[0];
  assert.deepEqual(m.pages.map((p) => p.url), ["https://img/p1.jpg", "https://img/p2.jpg"]);
  assert.equal(m.pageCount, 2);
});

// ---- the real renderer, when poppler is installed (skipped on a machine without it) ----------------------
function hasPoppler() {
  try { execFileSync("pdftoppm", ["-v"], { stdio: "ignore" }); execFileSync("pdfinfo", ["-v"], { stdio: "ignore" }); return true; } catch { return false; }
}

// A tiny valid PDF with n pages, no external tools.
function makePdf(n) {
  const objs = [];
  const add = (body) => { objs.push(body); return objs.length; };
  const catalog = add("");
  const pagesId = add("");
  const font = add("<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>");
  const kids = [];
  for (let i = 1; i <= n; i += 1) {
    const stream = `BT /F1 24 Tf 72 700 Td (Page ${i}) Tj ET`;
    const content = add(`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`);
    kids.push(add(`<< /Type /Page /Parent ${pagesId} 0 R /MediaBox [0 0 612 792] /Contents ${content} 0 R /Resources << /Font << /F1 ${font} 0 R >> >> >>`));
  }
  objs[catalog - 1] = `<< /Type /Catalog /Pages ${pagesId} 0 R >>`;
  objs[pagesId - 1] = `<< /Type /Pages /Kids [${kids.map((k) => `${k} 0 R`).join(" ")}] /Count ${n} >>`;
  let out = "%PDF-1.4\n";
  const offsets = [];
  objs.forEach((body, i) => { offsets.push(out.length); out += `${i + 1} 0 obj\n${body}\nendobj\n`; });
  const xref = out.length;
  out += `xref\n0 ${objs.length + 1}\n0000000000 65535 f \n${offsets.map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("")}`;
  out += `trailer\n<< /Size ${objs.length + 1} /Root ${catalog} 0 R >>\nstartxref\n${xref}\n%%EOF`;
  return Buffer.from(out, "latin1");
}

test("the real renderer draws page 1 and 2 first, then the rest in order", { skip: !hasPoppler() && "poppler is not installed" }, async () => {
  const { renderDocumentBuffer } = require("../src/utils/documentRenderer");
  const chunks = [];
  const out = await renderDocumentBuffer(makePdf(9), "application/pdf", "nine.pdf", { onChunk: async ({ pages, pageCount, totalPages }) => chunks.push({ pages: pages.map((p) => p.page), pageCount, totalPages }) });
  assert.deepEqual(chunks[0].pages, [1, 2], "the first chunk is small, so page 1 appears quickly");
  assert.deepEqual(chunks.flatMap((c) => c.pages), [1, 2, 3, 4, 5, 6, 7, 8, 9]);
  assert.ok(chunks.every((c) => c.pageCount === 9 && c.totalPages === 9));
  assert.deepEqual(out, { pageCount: 9, totalPages: 9 });
});

test("the real renderer without a callback still returns every page, as before", { skip: !hasPoppler() && "poppler is not installed" }, async () => {
  const { renderDocumentBuffer } = require("../src/utils/documentRenderer");
  const out = await renderDocumentBuffer(makePdf(4), "application/pdf", "four.pdf");
  assert.equal(out.pageCount, 4);
  assert.deepEqual(out.pages.map((p) => p.page), [1, 2, 3, 4]);
  assert.ok(out.pages.every((p) => p.buffer.length > 500));
});

test("the real renderer caps very long documents and reports the true length", { skip: !hasPoppler() && "poppler is not installed" }, async () => {
  const { renderDocumentBuffer, MAX_PAGES } = require("../src/utils/documentRenderer");
  const chunks = [];
  const out = await renderDocumentBuffer(makePdf(MAX_PAGES + 7), "application/pdf", "long.pdf", { onChunk: async (c) => chunks.push(c) });
  assert.equal(out.pageCount, MAX_PAGES);
  assert.equal(out.totalPages, MAX_PAGES + 7);
  assert.equal(chunks.flatMap((c) => c.pages).length, MAX_PAGES);
});

test("something that is not a document is refused", async () => {
  const { renderDocumentBuffer } = require("../src/utils/documentRenderer");
  await assert.rejects(renderDocumentBuffer(Buffer.from("x"), "text/plain", "x.txt"), /Unsupported document type/);
});
