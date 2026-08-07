const mongoose = require("mongoose");
const Listing = require("../models/Listing");
const JobListing = require("../models/JobListing");

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// ---------- Listings (items) ----------

exports.getListings = async (req, res) => {
  try {
    const filter = { status: "available" };
    if (req.query.category) filter.category = req.query.category;
    const listings = await Listing.find(filter).sort({ createdAt: -1 });
    res.status(200).json({ status: "success", count: listings.length, data: listings });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching listings: " + error.message });
  }
};

exports.getListingById = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ status: "error", message: "Invalid listing id" });
    }
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
      return res.status(404).json({ status: "error", message: "Listing not found" });
    }
    res.status(200).json({ status: "success", data: listing });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching listing: " + error.message });
  }
};

exports.createListing = async (req, res) => {
  try {
    const { title, description, category, price } = req.body;
    if (!title || !category) {
      return res.status(400).json({ status: "error", message: "title and category are required" });
    }
    const listing = await Listing.create({
      title,
      description,
      category,
      price,
      sellerId: req.user.id
    });
    res.status(201).json({ status: "success", data: listing });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error creating listing: " + error.message });
  }
};

exports.markListingSold = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ status: "error", message: "Invalid listing id" });
    }
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
      return res.status(404).json({ status: "error", message: "Listing not found" });
    }
    if (listing.sellerId !== req.user.id) {
      return res.status(403).json({ status: "error", message: "Only the seller can mark this listing sold" });
    }
    listing.status = "sold";
    await listing.save();
    res.status(200).json({ status: "success", data: listing });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error updating listing: " + error.message });
  }
};

// Image attach is a separate step from createListing so uploads can
// be added one at a time without re-sending the whole form each time.
exports.addListingImage = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ status: "error", message: "Invalid listing id" });
    }
    if (!req.file) {
      return res.status(400).json({ status: "error", message: "No image file provided" });
    }
    const listing = await Listing.findById(req.params.id);
    if (!listing) {
      return res.status(404).json({ status: "error", message: "Listing not found" });
    }
    const { uploadBufferToCloudinary } = require("../config/cloudinary");
    const result = await uploadBufferToCloudinary(req.file.buffer, "unilink/listings", "image");
    listing.imageUrls.push(result.secure_url);
    await listing.save();
    res.status(200).json({ status: "success", data: listing });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error uploading listing image: " + error.message });
  }
};

// ---------- Job Listings ----------

exports.getJobListings = async (req, res) => {
  try {
    const jobs = await JobListing.find({}).sort({ createdAt: -1 });
    res.status(200).json({ status: "success", count: jobs.length, data: jobs });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching job listings: " + error.message });
  }
};

exports.createJobListing = async (req, res) => {
  try {
    const { title, company, type, description, applyUrl } = req.body;
    if (!title) {
      return res.status(400).json({ status: "error", message: "title is required" });
    }
    const job = await JobListing.create({
      title,
      company,
      type,
      description,
      applyUrl,
      postedBy: req.user.id
    });
    res.status(201).json({ status: "success", data: job });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error creating job listing: " + error.message });
  }
};
