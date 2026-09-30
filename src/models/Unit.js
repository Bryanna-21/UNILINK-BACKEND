const mongoose = require("mongoose");

const unitSchema = new mongoose.Schema(
  {
    code: {
      type: String,
      required: true,
      unique: true,
      uppercase: true,
    },
    name: {
      type: String,
      required: true,
    },
    description: {
      type: String,
      default: "",
    },
    credits: {
      type: Number,
      required: true,
      min: 1,
      max: 6,
    },
    universityId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "University",
      default: null,
    },
    // Optional per spec: a Unit can remain global/undepartmentalized
    // (departmentId: null) exactly as it can remain universityId: null
    // already did. When set, admin.controller.js's createUnit/updateUnit
    // validate that this department's own universityId matches the
    // Unit's universityId — enforced in the controller, not here, since
    // Mongoose validators can't easily cross-reference another
    // document's field without an async validator duplicating that
    // controller-side check anyway.
    departmentId: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "Department",
      default: null,
    },
    status: {
      type: String,
      enum: ["active", "inactive"],
      default: "active",
    },
  },
  { timestamps: true }
);

unitSchema.index({ code: 1 }, { unique: true });
unitSchema.index({ universityId: 1 });
unitSchema.index({ departmentId: 1 });
unitSchema.index({ status: 1 });

module.exports = mongoose.model("Unit", unitSchema);
