const mongoose = require("mongoose");

const universitySchema = new mongoose.Schema({
  name: { type: String, required: true },
  country: String,
  domainCode: String,
  verified: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
});

// Case-insensitive uniqueness on name - "University of Nairobi" and
// "university of nairobi" must collide, not create two records. A
// collation-backed unique index enforces this at the database level
// (not just an application-layer check, which can race under
// concurrent requests) - see MongoDB's collation docs, strength: 2
// means case-insensitive comparison.
universitySchema.index(
  { name: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } }
);

module.exports = mongoose.model("University", universitySchema);
