const mongoose = require("mongoose");

const courseSchema = new mongoose.Schema({
  title: { type: String, required: true },
  code: { type: String, required: true },
  description: String,
  universityId: String,
  lecturerId: String,
  enrolledStudentIds: { type: [String], default: [] },
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
