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

  // Optional — set only when this post was made INSIDE a community's
  // feed (see community_v2.controller.js's createCommunityPost). Null
  // means it's a regular main-feed post, same as before this field
  // existed. A community post is still also universityId-scoped
  // (inherited from the community itself), so a superadmin's
  // platform-wide feed view still sees it if they query broadly.
  communityId: {
    type: String,
    default: null,
    index: true,
  },

  // When present, this post is a reshare of another post.
  // The original post remains the source of truth; the reshare
  // belongs to the user who reshared it.
  reshareOf: {
    type: String,
    default: null,
    index: true,
  },

  // Optional: the title requirement was removed. A post is now text, photos, videos or a mix;
  // createPost enforces that it has at least one of them. Existing posts keep their titles.
  title: {
    type: String,
    trim: true,
    maxlength: 200,
    default: "",
  },

  content: {
    type: String,
    trim: true,
    maxlength: 5000,
    default: "",
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
        enum: ["image", "video", "document"],
        required: true,
      },

      publicId: {
        type: String,
        required: true,
      },

      mimeType: {
        type: String,
        default: null,
      },

      originalName: {
        type: String,
        default: null,
      },

      pageCount: {
        type: Number,
        default: 0,
        min: 0,
      },

      processingStatus: {
        type: String,
        enum: ["pending", "ready", "failed"],
        default: "ready",
      },

      pages: [
        {
          page: {
            type: Number,
            required: true,
            min: 1,
          },

          url: {
            type: String,
            required: true,
          },

          publicId: {
            type: String,
            required: true,
          },
        },
      ],
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
