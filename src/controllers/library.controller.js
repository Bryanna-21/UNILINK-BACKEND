const mongoose = require("mongoose");
const Book = require("../models/Book");
const BookLoan = require("../models/BookLoan");
const DigitalResource = require("../models/DigitalResource");
const { uploadBufferToCloudinary } = require("../config/cloudinary");

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);
const isStaff = (role) => role === "lecturer" || role === "admin";

// ---------- Physical Books ----------

exports.getBooks = async (req, res) => {
  try {
    const books = await Book.find({}).sort({ title: 1 });
    res.status(200).json({ status: "success", count: books.length, data: books });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching books: " + error.message });
  }
};

exports.addBook = async (req, res) => {
  try {
    if (!isStaff(req.user.role)) {
      return res.status(403).json({ status: "error", message: "Only lecturers or admins can add books" });
    }
    const { title, author, isbn, totalCopies } = req.body;
    if (!title) {
      return res.status(400).json({ status: "error", message: "title is required" });
    }
    const copies = totalCopies || 1;
    const book = await Book.create({ title, author, isbn, totalCopies: copies, availableCopies: copies });
    res.status(201).json({ status: "success", data: book });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error adding book: " + error.message });
  }
};

exports.borrowBook = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ status: "error", message: "Invalid book id" });
    }
    const book = await Book.findById(req.params.id);
    if (!book) {
      return res.status(404).json({ status: "error", message: "Book not found" });
    }
    if (book.availableCopies < 1) {
      return res.status(400).json({ status: "error", message: "No copies available" });
    }

    const dueDate = new Date();
    dueDate.setDate(dueDate.getDate() + 14); // 2-week loan period, a reasonable default

    const loan = await BookLoan.create({
      bookId: req.params.id,
      userId: req.user.id,
      status: "borrowed",
      borrowedAt: new Date(),
      dueDate
    });

    book.availableCopies -= 1;
    await book.save();

    res.status(201).json({ status: "success", data: loan });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error borrowing book: " + error.message });
  }
};

exports.returnBook = async (req, res) => {
  try {
    if (!isValidId(req.params.loanId)) {
      return res.status(400).json({ status: "error", message: "Invalid loan id" });
    }
    const loan = await BookLoan.findById(req.params.loanId);
    if (!loan) {
      return res.status(404).json({ status: "error", message: "Loan not found" });
    }
    if (loan.userId !== req.user.id) {
      return res.status(403).json({ status: "error", message: "This is not your loan" });
    }
    if (loan.status === "returned") {
      return res.status(400).json({ status: "error", message: "Already returned" });
    }

    loan.status = "returned";
    loan.returnedAt = new Date();
    await loan.save();

    const book = await Book.findById(loan.bookId);
    if (book) {
      book.availableCopies = Math.min(book.availableCopies + 1, book.totalCopies);
      await book.save();
    }

    res.status(200).json({ status: "success", data: loan });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error returning book: " + error.message });
  }
};

exports.getMyLoans = async (req, res) => {
  try {
    const loans = await BookLoan.find({ userId: req.user.id }).sort({ borrowedAt: -1 });
    res.status(200).json({ status: "success", count: loans.length, data: loans });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching loans: " + error.message });
  }
};

// ---------- Digital Resources ----------

exports.getDigitalResources = async (req, res) => {
  try {
    const filter = req.query.category ? { category: req.query.category } : {};
    const resources = await DigitalResource.find(filter).sort({ createdAt: -1 });
    res.status(200).json({ status: "success", count: resources.length, data: resources });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching digital resources: " + error.message });
  }
};

exports.uploadDigitalResource = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ status: "error", message: "No file provided" });
    }
    const { title, author, category } = req.body;
    if (!title) {
      return res.status(400).json({ status: "error", message: "title is required" });
    }
    const result = await uploadBufferToCloudinary(req.file.buffer, "unilink/digital-library", "raw");
    const resource = await DigitalResource.create({
      title,
      author,
      category,
      fileUrl: result.secure_url,
      uploadedBy: req.user.id
    });
    res.status(201).json({ status: "success", data: resource });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error uploading resource: " + error.message });
  }
};
