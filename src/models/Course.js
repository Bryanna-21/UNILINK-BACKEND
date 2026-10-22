const mongoose = require("mongoose");

const courseSchema = new mongoose.Schema({
  title: { type: String, required: true },
  code: { type: String, required: true },
  description: String,
  qualificationLevel: {
    type: String,
    enum: [
      "certificate",
      "diploma",
      "higher_diploma",
      "degree",
      "postgraduate",
      "other",
    ],
  },
  fieldOfStudy: { type: String, default: "" },
  verificationStatus: {
    type: String,
    enum: [
      "verified",
      "needs_client_verification",
      "needs_official_verification",
    ],
  },
  verificationSource: { type: String, default: null },
  unitAssignments: [{
    unitId: { type: String, required: true },
    yearOfStudy: { type: Number, min: 1, max: 6, default: null },
    semester: { type: Number, min: 1, max: 3, default: null },
  }],
  universityId: String,
  lecturerId: String,
  enrolledStudentIds: { type: [String], default: [] },
  // References into the global Unit catalog (models/Unit.js), which
  // is superadmin-managed (see admin.controller.js's createUnit).
  // This course does not own or create Units — it only records which
  // existing catalog units it covers. See course.controller.js's
  // attachUnit for how entries get added here.
  unitIds: { type: [String], default: [] },
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
