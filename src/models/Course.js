const mongoose = require("mongoose");

const courseSchema = new mongoose.Schema({
  title: { type: String, required: true },
  code: { type: String, required: true },
  description: String,
  universityId: String,
  lecturerId: String,
  enrolledStudentIds: { type: [String], default: [] },
  // References into the global Unit catalog (models/Unit.js), which
  // is superadmin-managed (see admin.controller.js's createUnit).
  // This course does not own or create Units — it only records which
  // existing catalog units it covers. See course.controller.js's
  // attachUnit for how entries get added here.
  unitIds: { type: [String], default: [] },
  // Catalogue metadata. Older courses have none of these until the catalogue seed fills them in.
  level: { type: String, enum: ["certificate", "diploma", "higher_diploma", "degree", "postgraduate"], default: null },
  durationYears: { type: Number, default: null, min: 1, max: 8 },
  semestersPerYear: { type: Number, default: null, min: 1, max: 3 },
  // "verified" only once a superadmin has confirmed the programme (and its units) against the institution.
  // The two "needs_..." values below were written by an earlier session; anything but "verified" reads as unverified.
  verificationStatus: { type: String, enum: ["verified", "needs_verification", "needs_client_verification", "needs_official_verification"], default: "needs_verification" },
  catalogueSource: { type: String, default: null },
  createdAt: { type: Date, default: Date.now }
});

// Same course code can legitimately exist at two different
// universities, but not twice at the same one. Compound unique index,
// case-insensitive on code (CS101 and cs101 should collide).
courseSchema.index(
  { universityId: 1, code: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } }
);

module.exports = mongoose.model("Course", courseSchema);
