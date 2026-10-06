const mongoose = require("mongoose");

const announcementSchema = new mongoose.Schema({
  title: { type: String, required: true },
  body: { type: String, required: true },
  courseId: String, // optional — course-specific announcements. Omitted = campus-wide (within universityId).
  campusId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Campus",
    default: null,
  },
  // Added retroactively — "campus-wide" previously meant GLOBAL across
  // every university, not just the poster's own campus. Required
  // going forward; see scripts/backfillUniversityScoping.js for
  // existing documents.
  universityId: { type: String, required: true },
  postedBy: { type: String, required: true },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Announcement", announcementSchema);
