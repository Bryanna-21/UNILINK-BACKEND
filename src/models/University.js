const mongoose = require("mongoose");

const universitySchema = new mongoose.Schema({
  name: String,
  country: String,
  domainCode: String,
  verified: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("University", universitySchema);
