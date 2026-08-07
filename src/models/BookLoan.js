const mongoose = require("mongoose");

const bookLoanSchema = new mongoose.Schema({
  bookId: { type: String, required: true },
  userId: { type: String, required: true },
  status: { type: String, enum: ["reserved", "borrowed", "returned"], default: "reserved" },
  borrowedAt: Date,
  dueDate: Date,
  returnedAt: Date
});

module.exports = mongoose.model("BookLoan", bookLoanSchema);
