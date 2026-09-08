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
unitSchema.index({ status: 1 });

module.exports = mongoose.model("Unit", unitSchema);
