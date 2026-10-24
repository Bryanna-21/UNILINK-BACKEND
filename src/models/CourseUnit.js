const mongoose = require("mongoose");

// One unit placed inside one course: "Database Systems is a Year 1, Semester 2 unit of BSc IT at this institution".
// This is a PLACEMENT, so the same subject can sit in different years or semesters in different courses (or the same
// code can exist at two institutions) without colliding. It deliberately does not touch the older global Unit model,
// whose unique `code` index cannot express that. `unitId` optionally links a placement to a global Unit.
const courseUnitSchema = new mongoose.Schema(
  {
    courseId: { type: String, required: true },
    universityId: { type: String, required: true }, // the institution; copied from the course for scoping
    code: { type: String, required: true, uppercase: true, trim: true },
    name: { type: String, required: true, trim: true },
    description: { type: String, default: "" },
    credits: { type: Number, default: null, min: 0, max: 30 },
    yearOfStudy: { type: Number, required: true, min: 1, max: 8 },
    semester: { type: Number, required: true, min: 1, max: 3 },
    unitId: { type: String, default: null },
    verificationStatus: { type: String, enum: ["verified", "needs_verification"], default: "needs_verification" },
    source: { type: String, default: "catalogue-seed" }, // catalogue-seed | admin-import
    status: { type: String, enum: ["active", "inactive"], default: "active" },
  },
  { timestamps: true }
);

// A unit code appears once per course (case-insensitive). The same code may exist in other courses.
courseUnitSchema.index({ courseId: 1, code: 1 }, { unique: true, collation: { locale: "en", strength: 2 } });
courseUnitSchema.index({ courseId: 1, yearOfStudy: 1, semester: 1 });
courseUnitSchema.index({ universityId: 1, code: 1 });

module.exports = mongoose.model("CourseUnit", courseUnitSchema);
