const mongoose = require("mongoose");

// Deliberately separate from Listing — a job has no price/category
// in the marketplace sense, and needs its own fields (company,
// employment type, application link) that don't belong on an item
// listing. Matches the mobile shell's explicit note on this.
const jobListingSchema = new mongoose.Schema({
  title: { type: String, required: true },
  company: String,
  type: { type: String, enum: ["job", "internship"], default: "job" },
  description: String,
  applyUrl: String,
  postedBy: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("JobListing", jobListingSchema);
