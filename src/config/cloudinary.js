const cloudinary = require("cloudinary").v2;

cloudinary.config({
  cloud_name: process.env.CLOUDINARY_CLOUD_NAME,
  api_key: process.env.CLOUDINARY_API_KEY,
  api_secret: process.env.CLOUDINARY_API_SECRET
});

/**
 * Uploads a buffer (from multer memoryStorage) to Cloudinary and
 * returns the secure URL. `resourceType` should be "image" for
 * photos or "raw" for PDFs/documents — Cloudinary treats these
 * differently and picking the wrong one causes broken links.
 */
const uploadBufferToCloudinary = (buffer, folder, resourceType = "image") => {
  return new Promise((resolve, reject) => {
    const stream = cloudinary.uploader.upload_stream(
      { folder, resource_type: resourceType },
      (error, result) => {
        if (error) return reject(error);
        resolve(result);
      }
    );
    stream.end(buffer);
  });
};

module.exports = { cloudinary, uploadBufferToCloudinary };
