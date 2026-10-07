const mongoose = require("mongoose");

const universitySchema = new mongoose.Schema({
  name: { type: String, required: true },
  // Added: admin.controller.js's createUniversity has always required,
  // duplicate-checked, and returned this field, but it was never
  // declared here — Mongoose's default strict mode silently dropped it
  // on save, so the duplicate check (`findOne({ email })`) was dead code
  // and every response lied about what was actually persisted.
  email: { type: String, required: false, unique: true, sparse: true, trim: true, lowercase: true },
  country: String,
  domainCode: String,
  // Added: same silent-drop issue as email. createUniversity has always
  // written status: "active" and returned it, with nothing in the schema
  // to receive it.
  status: { type: String, enum: ["active", "inactive"], default: "active" },
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
