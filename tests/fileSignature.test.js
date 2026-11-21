"use strict";
const test = require("node:test");
const assert = require("node:assert/strict");
const { detectKind, contentMatchesClaim } = require("../src/utils/fileSignature");

const pad = (bytes, total = 64) => Buffer.concat([Buffer.from(bytes), Buffer.alloc(Math.max(0, total - bytes.length), 0x20)]);
const ascii = (text, total = 64) => pad(Buffer.from(text, "latin1"), total);
const files = {
  jpeg: pad([0xff, 0xd8, 0xff, 0xe0]),
  png: pad([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]),
  gif: ascii("GIF89a"),
  webp: Buffer.concat([ascii("RIFF", 4), Buffer.alloc(4), ascii("WEBPVP8 ", 20)]),
  heic: Buffer.concat([Buffer.alloc(4), ascii("ftypheic", 20)]),
  mp4: Buffer.concat([Buffer.alloc(4), ascii("ftypisom", 20)]),
  mov: Buffer.concat([Buffer.alloc(4), ascii("ftypqt  ", 20)]),
  webm: pad([0x1a, 0x45, 0xdf, 0xa3]),
  avi: Buffer.concat([ascii("RIFF", 4), Buffer.alloc(4), ascii("AVI LIST", 20)]),
  pdf: ascii("%PDF-1.7\n"),
  pdfLate: Buffer.concat([Buffer.alloc(300, 0x20), ascii("%PDF-1.4")]),
  docx: pad([0x50, 0x4b, 0x03, 0x04]),
  doc: pad([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]),
  html: ascii("<html><script>alert(1)</script></html>"),
  script: ascii("#!/bin/sh\nrm -rf /\n"),
  svg: ascii('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'),
  exe: pad([0x4d, 0x5a, 0x90, 0x00]),
};

test("each real format is recognised from its first bytes", () => {
  const expected = { jpeg: "jpeg", png: "png", gif: "gif", webp: "webp", heic: "heif", mp4: "mp4", mov: "mp4", webm: "webm", avi: "avi", pdf: "pdf", pdfLate: "pdf", docx: "zip", doc: "ole" };
  for (const [name, kind] of Object.entries(expected)) assert.equal(detectKind(files[name]), kind, name);
});

test("scripts, web pages, SVG, programs and tiny or empty buffers are not recognised", () => {
  for (const name of ["html", "script", "svg", "exe"]) assert.equal(detectKind(files[name]), null, name);
  assert.equal(detectKind(Buffer.alloc(0)), null);
  assert.equal(detectKind(Buffer.from("PK")), null);
  assert.equal(detectKind(null), null);
  assert.equal(detectKind("text"), null);
});

test("a real photo passes as an image, whatever raster type it is", () => {
  for (const n of ["jpeg", "png", "gif", "webp", "heic"]) assert.equal(contentMatchesClaim("image/jpeg", files[n]), true, n);
});

test("THE ATTACK: a page, script or program claiming to be an image is refused", () => {
  for (const n of ["html", "script", "svg", "exe", "pdf", "mp4", "docx"]) assert.equal(contentMatchesClaim("image/png", files[n]), false, n);
});

test("SVG is refused even when it says so honestly", () => {
  assert.equal(contentMatchesClaim("image/svg+xml", files.svg), false);
});

test("videos must be real videos", () => {
  for (const n of ["mp4", "mov", "webm", "avi"]) assert.equal(contentMatchesClaim("video/mp4", files[n]), true, n);
  for (const n of ["jpeg", "html", "pdf", "exe"]) assert.equal(contentMatchesClaim("video/mp4", files[n]), false, n);
});

test("a PDF must be a PDF", () => {
  assert.equal(contentMatchesClaim("application/pdf", files.pdf), true);
  assert.equal(contentMatchesClaim("application/pdf", files.pdfLate), true);
  for (const n of ["jpeg", "docx", "html", "exe"]) assert.equal(contentMatchesClaim("application/pdf", files[n]), false, n);
});

test("Word files: a .docx (zip) or an old .doc is accepted under either label, nothing else is", () => {
  const word = ["application/msword", "application/vnd.openxmlformats-officedocument.wordprocessingml.document"];
  for (const claim of word) {
    assert.equal(contentMatchesClaim(claim, files.docx), true);
    assert.equal(contentMatchesClaim(claim, files.doc), true);
    for (const n of ["pdf", "jpeg", "html", "exe"]) assert.equal(contentMatchesClaim(claim, files[n]), false, `${claim} ${n}`);
  }
});

test("a claimed type that is not allowed at all is refused", () => {
  assert.equal(contentMatchesClaim("application/x-msdownload", files.exe), false);
  assert.equal(contentMatchesClaim("text/html", files.html), false);
  assert.equal(contentMatchesClaim("", files.jpeg), false);
  assert.equal(contentMatchesClaim(undefined, files.jpeg), false);
});
