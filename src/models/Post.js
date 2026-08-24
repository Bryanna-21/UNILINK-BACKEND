const mongoose = require("mongoose");

const postSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true,
  },

  universityId: {
    type: String,
    default: null,
    index: true,
  },

  title: {
    type: String,
    required: true,
    trim: true,
    minlength: 5,
    maxlength: 200,
  },

  content: {
    type: String,
    required: true,
    trim: true,
    minlength: 10,
  },

  // Deprecated legacy field.
  // Kept so existing documents remain readable.
  mediaUrl: String,

  media: [
    {
      url: {
        type: String,
        required: true,
      },

      type: {
        type: String,
        enum: ["image", "video"],
        required: true,
      },

      publicId: {
        type: String,
        required: true,
      },
    },
  ],

  likes: {
    type: Number,
    default: 0,
    min: 0,
  },

  commentsCount: {
    type: Number,
    default: 0,
    min: 0,
  },

  score: {
    type: Number,
    default: 0,
  },

  createdAt: {
    type: Date,
    default: Date.now,
    index: true,
  },
});

module.exports = mongoose.model("Post", postSchema);
