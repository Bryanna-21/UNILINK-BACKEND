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

async function convertOfficeToPdf(inputPath, outputDir) {
  await execFileAsync(
    "libreoffice",
    [
      "--headless",
      "--convert-to",
      "pdf",
      "--outdir",
      outputDir,
      inputPath,
    ],
    {
      timeout: 120000,
      maxBuffer: 1024 * 1024,
    }
  );

  const baseName = path.basename(inputPath, path.extname(inputPath));
  const pdfPath = path.join(outputDir, `${baseName}.pdf`);

  await fs.access(pdfPath);

  return pdfPath;
}

async function renderPdfPages(pdfPath, outputDir) {
  const prefix = path.join(outputDir, "page");

  await execFileAsync(
    "pdftoppm",
    [
      "-jpeg",
      "-r",
      "144",
      pdfPath,
      prefix,
    ],
    {
      timeout: 120000,
      maxBuffer: 1024 * 1024,
    }
  );

  const files = await fs.readdir(outputDir);

  const pageFiles = files
    .filter((file) => /^page-\d+\.jpg$/i.test(file))
    .sort((a, b) => {
      const pageA = Number(a.match(/\d+/)?.[0] || 0);
      const pageB = Number(b.match(/\d+/)?.[0] || 0);
      return pageA - pageB;
    });

  return Promise.all(
    pageFiles.map(async (file, index) => ({
      page: index + 1,
      buffer: await fs.readFile(path.join(outputDir, file)),
    }))
  );
}

async function renderDocumentBuffer(
  buffer,
  mimeType,
  originalName = "document"
) {
  if (!isSupportedDocumentMimeType(mimeType)) {
    throw new Error(`Unsupported document type: ${mimeType}`);
  }

  const workDir = await fs.mkdtemp(
    path.join(os.tmpdir(), "unilink-document-")
  );

  try {
    const safeName =
      path.basename(originalName).replace(/[^a-zA-Z0-9._-]/g, "_") ||
      "document";

    const inputPath = path.join(
      workDir,
      `${crypto.randomUUID()}-${safeName}`
    );

    await fs.writeFile(inputPath, buffer);

    let pdfPath = inputPath;

    if (isOfficeDocument(mimeType)) {
      pdfPath = await convertOfficeToPdf(inputPath, workDir);
    }

    const pages = await renderPdfPages(pdfPath, workDir);

    if (pages.length === 0) {
      throw new Error("Document produced no renderable pages");
    }

    return {
      pageCount: pages.length,
      pages,
    };
  } finally {
    await fs.rm(workDir, {
      recursive: true,
      force: true,
    });
  }
}

module.exports = {
  DOCUMENT_MIME_TYPES,
  isSupportedDocumentMimeType,
  renderDocumentBuffer,
};
