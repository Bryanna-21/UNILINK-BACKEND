"use strict";

// What a file really is, read from its first bytes, never from the name or the type the sender claimed.
// The upload filters only looked at the claimed type, so a script or a web page could be uploaded as "image/png".
// This checks the real signature against the claimed family. PURE (tests/fileSignature.test.js).
//
// SVG is refused on purpose: it is XML that can carry scripts, and nothing in UniLink needs it.

const startsWith = (buf, bytes, offset = 0) => buf.length >= offset + bytes.length && bytes.every((b, i) => buf[offset + i] === b);
const ascii = (buf, from, to) => buf.slice(from, to).toString("latin1");

const IMAGE_BRANDS = ["heic", "heix", "hevc", "hevx", "heim", "heis", "mif1", "msf1", "avif", "avis"];

// "jpeg" | "png" | "gif" | "webp" | "heif" | "pdf" | "zip" | "ole" | "mp4" | "webm" | "avi" | null
function detectKind(buf) {
  if (!Buffer.isBuffer(buf) || buf.length < 12) return null;
  if (startsWith(buf, [0xff, 0xd8, 0xff])) return "jpeg";
  if (startsWith(buf, [0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a])) return "png";
  if (ascii(buf, 0, 6) === "GIF87a" || ascii(buf, 0, 6) === "GIF89a") return "gif";
  if (ascii(buf, 0, 4) === "RIFF" && ascii(buf, 8, 12) === "WEBP") return "webp";
  if (ascii(buf, 0, 4) === "RIFF" && ascii(buf, 8, 12) === "AVI ") return "avi";
  if (ascii(buf, 4, 8) === "ftyp") return IMAGE_BRANDS.includes(ascii(buf, 8, 12)) ? "heif" : "mp4";
  if (startsWith(buf, [0x1a, 0x45, 0xdf, 0xa3])) return "webm";
  if (ascii(buf, 0, Math.min(buf.length, 1024)).includes("%PDF-")) return "pdf";
  if (startsWith(buf, [0x50, 0x4b, 0x03, 0x04]) || startsWith(buf, [0x50, 0x4b, 0x05, 0x06])) return "zip";
  if (startsWith(buf, [0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1])) return "ole";
  return null;
}

const RASTER = ["jpeg", "png", "gif", "webp", "heif"];
const VIDEO = ["mp4", "webm", "avi"];
const WORD = ["zip", "ole"]; // .docx is a zip, .doc is an old Office file; clients often mislabel one as the other

// Does the real content fit the type the sender claimed?
function contentMatchesClaim(claimedType, buf) {
  const claim = String(claimedType || "").toLowerCase();
  const kind = detectKind(buf);
  if (!kind) return false;
  if (claim === "image/svg+xml") return false;
  if (claim.startsWith("image/")) return RASTER.includes(kind);
  if (claim.startsWith("video/")) return VIDEO.includes(kind);
  if (claim === "application/pdf") return kind === "pdf";
  if (claim === "application/msword" || claim === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") return WORD.includes(kind);
  return false;
}

module.exports = { detectKind, contentMatchesClaim };
