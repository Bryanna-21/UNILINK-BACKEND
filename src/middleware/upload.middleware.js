const multer = require("multer");
const { contentMatchesClaim } = require("../utils/fileSignature");
const { findBadKey } = require("./sanitize.middleware");

const storage = multer.memoryStorage();

const imageFilter = (req, file, cb) => {
  if (file.mimetype.startsWith("image/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image files are allowed"), false);
  }
};

const documentFilter = (req, file, cb) => {
  const allowed = [
    "application/pdf",
    "image/jpeg",
    "image/png",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only PDF, JPEG, PNG, DOC, or DOCX files are allowed"), false);
  }
};

// Posts accept a mix of images and video in one request, unlike the
// single-file uploaders above. Video needs a much larger cap than
// images - 50MB is a starting point, not a verified ceiling. Render's
// own request size/timeout limits on the free tier may bite before
// this number does; if uploads mysteriously fail on larger video
// files, check Render's request limits before assuming this value
// is wrong.
const postMediaFilter = (req, file, cb) => {
  const allowedDocuments = [
    "application/pdf",
    "application/msword",
    "application/vnd.openxmlformats-officedocument.wordprocessingml.document",
  ];

  if (
    file.mimetype.startsWith("image/") ||
    file.mimetype.startsWith("video/") ||
    allowedDocuments.includes(file.mimetype)
  ) {
    cb(null, true);
  } else {
    cb(new Error("Only image, video, PDF, DOC, or DOCX files are allowed"), false);
  }
};

// After multer has read the files: refuse a file whose real content is not what it claims to be (a script labelled
// as a PNG), and refuse form fields that carry database operators (multipart bodies are read after the app-wide
// check, so they need their own).
function verifyUploadedFiles(req, res, next) {
  const files = [];
  if (req.file) files.push(req.file);
  if (Array.isArray(req.files)) files.push(...req.files);
  else if (req.files && typeof req.files === "object") Object.values(req.files).forEach((list) => files.push(...list));

  if (findBadKey(req.body)) {
    return res.status(400).json({ status: "error", message: "Invalid request." });
  }
  const bad = files.find((f) => !contentMatchesClaim(f.mimetype, f.buffer));
  if (bad) {
    console.warn(`[security] refused upload "${bad.originalname}" claimed as ${bad.mimetype}: content does not match`);
    return res.status(400).json({ status: "error", message: "One of the files is not the type it says it is. Please choose a real photo, video, PDF or Word file." });
  }
  return next();
}

// Routes use these exactly as before (uploadImage.single("avatar"), uploadPostMedia ...); the check comes with them.
const verified = (instance) => ({
  single: (field) => [instance.single(field), verifyUploadedFiles],
  array: (field, max) => [instance.array(field, max), verifyUploadedFiles],
  fields: (spec) => [instance.fields(spec), verifyUploadedFiles],
});

const uploadImage = verified(multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: imageFilter
}));

const uploadDocument = verified(multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB, PDFs run larger than images
  fileFilter: documentFilter
}));

// .array("media", 4): field name clients must use is "media", max 4
// files per post. Raise the cap later if needed - keeping it low for
// now since each file also costs a Cloudinary upload round-trip, and
// posts are a high-frequency feature compared to e.g. marketplace
// listings.
const uploadPostMedia = [
  multer({
    storage,
    limits: { fileSize: 50 * 1024 * 1024 }, // 50MB - video ceiling, unverified against Render limits
    fileFilter: postMediaFilter
  }).array("media", 4),
  verifyUploadedFiles,
];

module.exports = { uploadImage, uploadDocument, uploadPostMedia, verifyUploadedFiles };
