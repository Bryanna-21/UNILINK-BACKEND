const mongoose = require("mongoose");

// Sits between Faculty and Unit: University -> Faculty -> Department
// -> Unit. universityId is denormalized here rather than looked up
// through facultyId every time — same pattern EmergencyReport already
// uses for courseId/universityId, and it's what lets
// setDepartmentFacultyId (admin.controller.js) validate "does this
// faculty belong to this university" without an extra populate.
const departmentSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
    // Optional per spec, same convention as Faculty.code.
    code: {
      type: String,
      trim: true,
      uppercase: true,
      default: null,
    },
    facultyId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Faculty",
      required: true,
    },
    // Denormalized from facultyId.universityId at creation time, not
    // trusted from client input — see createDepartment in
    // admin.controller.js. Exists so integrity checks elsewhere (a
    // Unit's departmentId belonging to the same university as the
    // Unit itself) don't need to populate through Faculty every time.
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

// Case-insensitive uniqueness on (facultyId, name) — two departments
// with the same name can't exist under one faculty, but the same
// department name (e.g. "Computer Science") can exist under a
// different faculty or university without collision.
departmentSchema.index(
  { facultyId: 1, name: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } }
);
departmentSchema.index({ facultyId: 1 });
departmentSchema.index({ universityId: 1 });
departmentSchema.index({ status: 1 });

module.exports = mongoose.model("Department", departmentSchema);
