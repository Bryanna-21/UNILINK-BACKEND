const mongoose = require("mongoose");

const bookSchema = new mongoose.Schema({
  title: { type: String, required: true },
  author: String,
  isbn: String,
  totalCopies: { type: Number, default: 1 },
  availableCopies: { type: Number, default: 1 },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Book", bookSchema);
