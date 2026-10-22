"use strict";
// The wired-up document backfill (real Post model, real renderer, real Cloudinary).
const { createDocumentBackfill } = require("./documentBackfill");
const { renderDocumentBuffer, isSupportedDocumentMimeType } = require("../utils/documentRenderer");
const { cloudinary, uploadBufferToCloudinary } = require("../config/cloudinary");

module.exports = createDocumentBackfill({
  Post: require("../models/Post"),
  render: renderDocumentBuffer,
  isSupported: isSupportedDocumentMimeType,
  uploadPage: (buffer, folder) => uploadBufferToCloudinary(buffer, folder, "image"),
  signedUrlFor: (publicId) => {
    try {
      return cloudinary.utils.private_download_url(publicId, "", { resource_type: "raw", type: "upload" });
    } catch {
      return null;
    }
  },
});
