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
  const allowed = ["application/pdf", "image/jpeg", "image/png"];
  if (allowed.includes(file.mimetype)) {
    cb(null, true);
  } else {
    cb(new Error("Only PDF, JPEG, or PNG files are allowed"), false);
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

module.exports = { uploadImage, uploadDocument };
