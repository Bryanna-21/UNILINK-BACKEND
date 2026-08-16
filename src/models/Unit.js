const mongoose = require("mongoose");

const unitSchema = new mongoose.Schema({
  courseId: { type: String, required: true },
  title: { type: String, required: true },
  description: String,
  order: { type: Number, default: 0 },
  createdAt: { type: Date, default: Date.now }
});

// A course shouldn't have two units with the same title.
unitSchema.index(
  { courseId: 1, title: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } }
);

module.exports = mongoose.model("Unit", unitSchema);
