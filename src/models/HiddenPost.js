const mongoose = require("mongoose");

const hiddenPostSchema = new mongoose.Schema({
  userId: {
    type: String,
    required: true,
    index: true,
  },

  postId: {
    type: String,
    required: true,
    index: true,
  },

  createdAt: {
    type: Date,
    default: Date.now,
  },
});

hiddenPostSchema.index(
  { userId: 1, postId: 1 },
  { unique: true }
);

module.exports = mongoose.model("HiddenPost", hiddenPostSchema);
