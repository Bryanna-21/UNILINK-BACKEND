const mongoose = require("mongoose");

// Top of the academic hierarchy below University itself:
// University -> Faculty -> Department -> Unit (see Department.js,
// and Unit.js's new departmentId). Unlike Unit, which can be global
// (universityId: null) per its own existing convention, a Faculty
// always belongs to exactly one University — there is no such thing
// as a faculty that isn't part of some institution.
const facultySchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    // Optional per spec, unlike Unit.code which is required — a short
    // label like "SCI" or "ENG", not validated against any format.
    code: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },
    universityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "University",
      required: true,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
  },
  { timestamps: true }
);

// Case-insensitive uniqueness on (universityId, name) — same
// collation approach as Community and University above it, so
// "Faculty of Science" and "faculty of science" collide within one
// university but an identically-named faculty can exist at another.
facultySchema.index(
  { universityId: 1, name: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } }
);
facultySchema.index({ universityId: 1 });
facultySchema.index({ status: 1 });

module.exports = mongoose.model("Faculty", facultySchema);
