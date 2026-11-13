const fs = require("fs/promises");
const os = require("os");
const path = require("path");
const crypto = require("crypto");
const { execFile } = require("child_process");
const { promisify } = require("util");

const execFileAsync = promisify(execFile);

const DOCUMENT_MIME_TYPES = new Set([
  "application/pdf",
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

const OFFICE_MIME_TYPES = new Set([
  "application/msword",
  "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
]);

function isSupportedDocumentMimeType(mimeType) {
  return DOCUMENT_MIME_TYPES.has(mimeType);
}

function isOfficeDocument(mimeType) {
  return OFFICE_MIME_TYPES.has(mimeType);
}

// LibreOffice keeps one shared user profile and locks it. Two conversions at the same moment (two
// people posting Word files, or a post and the background job) make the second one fail or hang,
// and that document is then left without page images. Giving every conversion its own profile
// folder lets them run side by side.
function libreOfficeArgs(inputPath, outputDir, profileDir) {
  return [
    `-env:UserInstallation=file://${profileDir}`,
    "--headless",
    "--convert-to",
    "pdf",
    "--outdir",
    outputDir,
    inputPath,
  ];
}

async function convertOfficeToPdf(inputPath, outputDir) {
  await execFileAsync(
    "libreoffice",
    libreOfficeArgs(inputPath, outputDir, path.join(outputDir, "lo-profile")),
    {
      timeout: 240000,
      maxBuffer: 1024 * 1024,
    }
  );

  const baseName = path.basename(inputPath, path.extname(inputPath));
  const pdfPath = path.join(outputDir, `${baseName}.pdf`);

  await fs.access(pdfPath);

  return pdfPath;
}

// How many pages the PDF has (0 when pdfinfo is missing or cannot read it).
async function pdfPageCount(pdfPath) {
  try {
    const { stdout } = await execFileAsync("pdfinfo", [pdfPath], { timeout: 30000, maxBuffer: 1024 * 1024 });
    const m = /^Pages:\s+(\d+)/m.exec(String(stdout));
    return m ? Number(m[1]) : 0;
  } catch {
    return 0;
  }
}

// Renders pages first..last of a PDF. pdftoppm names each file after the real page number.
async function renderPdfRange(pdfPath, outputDir, first, last, dpi) {
  const stem = `r${first}`;
  await execFileAsync(
    "pdftoppm",
    ["-jpeg", "-r", String(dpi), "-f", String(first), "-l", String(last), pdfPath, path.join(outputDir, stem)],
    { timeout: 90000, maxBuffer: 1024 * 1024 }
  );
  const files = (await fs.readdir(outputDir))
    .map((file) => ({ file, m: new RegExp(`^${stem}-(\\d+)\\.jpg$`, "i").exec(file) }))
    .filter((x) => x.m)
    .map((x) => ({ file: x.file, page: Number(x.m[1]) }))
    .sort((a, b) => a.page - b.page);
  const pages = [];
  for (const { file, page } of files) {
    const full = path.join(outputDir, file);
    pages.push({ page, buffer: await fs.readFile(full) });
    await fs.rm(full, { force: true });
  }
  return pages;
}

// The old way: every page in one go. Only used when the page count cannot be read.
async function renderPdfPagesAll(pdfPath, outputDir) {
  const prefix = path.join(outputDir, "page");
  await execFileAsync("pdftoppm", ["-jpeg", "-r", "144", pdfPath, prefix], { timeout: 120000, maxBuffer: 1024 * 1024 });
  const files = await fs.readdir(outputDir);
  const pageFiles = files
    .filter((file) => /^page-\d+\.jpg$/i.test(file))
    .sort((a, b) => Number(a.match(/\d+/)?.[0] || 0) - Number(b.match(/\d+/)?.[0] || 0));
  return Promise.all(pageFiles.map(async (file, index) => ({ page: index + 1, buffer: await fs.readFile(path.join(outputDir, file)) })));
}

// Long documents are drawn at a lower resolution (a phone does not need 144 dpi for page 60), and only the
// first MAX_PAGES are drawn.
const MAX_PAGES = 100;
const FIRST_CHUNK = 2; // page 1 and 2 reach the screen first
const CHUNK = 5;
const dpiFor = (pages) => (pages > 20 ? 110 : 144);

// Renders a document to page images.
//   with onChunk: the pages are handed over a few at a time, in order, as soon as they exist, so the first
//                 page can be shown while the rest are still being drawn. Resolves to { pageCount, totalPages }.
//   without:      resolves to { pageCount, pages } with every page (the old behaviour).
// pageCount is how many pages will be drawn; totalPages is how many the document really has.
async function renderDocumentBuffer(buffer, mimeType, originalName = "document", { onChunk } = {}) {
  if (!isSupportedDocumentMimeType(mimeType)) {
    throw new Error(`Unsupported document type: ${mimeType}`);
  }

  const workDir = await fs.mkdtemp(path.join(os.tmpdir(), "unilink-document-"));

  try {
    const safeName = path.basename(originalName).replace(/[^a-zA-Z0-9._-]/g, "_") || "document";
    const inputPath = path.join(workDir, `${crypto.randomUUID()}-${safeName}`);
    await fs.writeFile(inputPath, buffer);

    let pdfPath = inputPath;
    if (isOfficeDocument(mimeType)) {
      pdfPath = await convertOfficeToPdf(inputPath, workDir);
    }

    const total = await pdfPageCount(pdfPath);

    if (total === 0) {
      const pages = await renderPdfPagesAll(pdfPath, workDir);
      if (pages.length === 0) throw new Error("Document produced no renderable pages");
      if (onChunk) await onChunk({ pages, pageCount: pages.length, totalPages: pages.length });
      return onChunk ? { pageCount: pages.length, totalPages: pages.length } : { pageCount: pages.length, pages };
    }

    const drawn = Math.min(total, MAX_PAGES);
    const dpi = dpiFor(drawn);
    const collected = [];
    let first = 1;
    let size = Math.min(FIRST_CHUNK, drawn);
    while (first <= drawn) {
      const last = Math.min(first + size - 1, drawn);
      const pages = await renderPdfRange(pdfPath, workDir, first, last, dpi);
      if (pages.length === 0) throw new Error("Document produced no renderable pages");
      if (onChunk) await onChunk({ pages, pageCount: drawn, totalPages: total });
      else collected.push(...pages);
      first = last + 1;
      size = CHUNK;
    }

    return onChunk ? { pageCount: drawn, totalPages: total } : { pageCount: collected.length, pages: collected };
  } finally {
    await fs.rm(workDir, { recursive: true, force: true });
  }
}

module.exports = {
  MAX_PAGES,
  libreOfficeArgs,
  DOCUMENT_MIME_TYPES,
  isSupportedDocumentMimeType,
  renderDocumentBuffer,
};
