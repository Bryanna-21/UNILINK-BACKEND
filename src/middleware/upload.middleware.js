const multer = require("multer");

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
  if (file.mimetype.startsWith("image/") || file.mimetype.startsWith("video/")) {
    cb(null, true);
  } else {
    cb(new Error("Only image or video files are allowed"), false);
  }
};

const uploadImage = multer({
  storage,
  limits: { fileSize: 5 * 1024 * 1024 }, // 5MB
  fileFilter: imageFilter
});

const uploadDocument = multer({
  storage,
  limits: { fileSize: 15 * 1024 * 1024 }, // 15MB, PDFs run larger than images
  fileFilter: documentFilter
});

// .array("media", 4): field name clients must use is "media", max 4
// files per post. Raise the cap later if needed - keeping it low for
// now since each file also costs a Cloudinary upload round-trip, and
// posts are a high-frequency feature compared to e.g. marketplace
// listings.
const uploadPostMedia = multer({
  storage,
  limits: { fileSize: 50 * 1024 * 1024 }, // 50MB - video ceiling, unverified against Render limits
  fileFilter: postMediaFilter
}).array("media", 4);

module.exports = { uploadImage, uploadDocument, uploadPostMedia };
