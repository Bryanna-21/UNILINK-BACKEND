const mongoose = require("mongoose");

// The school timetable an admin writes for one university and publishes for its lecturers to
// discuss. Separate from the per-course timetable that lecturers manage themselves.
const entrySchema = new mongoose.Schema(
  {
    day: { type: String, required: true },
    start: { type: String, required: true },
    end: { type: String, required: true },
    unitCode: { type: String, required: true, maxlength: 20 },
    unitName: { type: String, default: "", maxlength: 100 },
    lecturer: { type: String, default: "", maxlength: 100 },
    room: { type: String, default: "", maxlength: 60 },
  },
  { _id: false }
);

const schema = new mongoose.Schema({
  universityId: { type: String, required: true, index: true },
  title: { type: String, required: true, maxlength: 150 },
  term: { type: String, default: "", maxlength: 80 },
  entries: { type: [entrySchema], default: [] },
  status: { type: String, enum: ["draft", "published", "finalized"], default: "draft", index: true },
  version: { type: Number, default: 1 },
  createdBy: { type: String, required: true },
  createdAt: { type: Date, default: Date.now },
  updatedAt: { type: Date, default: Date.now, index: true },
  publishedAt: { type: Date, default: null },
  suggestionsCloseAt: { type: Date, default: null }, // 14 days after publishing; lecturers and students can respond until then
  finalizedAt: { type: Date, default: null },
  finalizedBy: { type: String, default: null },
});

module.exports = mongoose.model("SchoolTimetable", schema);
