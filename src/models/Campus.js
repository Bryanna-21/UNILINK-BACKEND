const mongoose = require("mongoose");

const campusSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      trim: true,
    },
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

// A university cannot have two campuses with the same name.
// The same campus name can exist at different universities.
campusSchema.index(
  { universityId: 1, name: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } }
);

campusSchema.index({ universityId: 1 });
campusSchema.index({ status: 1 });

module.exports = mongoose.model("Campus", campusSchema);
