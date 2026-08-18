const mongoose = require("mongoose");

const postSchema = new mongoose.Schema({
  userId: String,
  universityId: String,
  content: String,
  // Deprecated: kept so any existing documents with this field
  // populated still read back correctly. Nothing writes to it anymore
  // - new uploads go through `media` below.
  mediaUrl: String,
  media: [
    {
      url: { type: String, required: true },
      type: { type: String, enum: ["image", "video"], required: true },
      // Cloudinary's public_id, needed if/when a delete-post or
      // remove-media endpoint gets built later - without this,
      // deleting the Mongo document orphans the file on Cloudinary
      // forever with no way to clean it up programmatically.
      publicId: { type: String, required: true }
    }
  ],
  likes: { type: Number, default: 0 },
  commentsCount: { type: Number, default: 0 },
  score: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Post", postSchema);
