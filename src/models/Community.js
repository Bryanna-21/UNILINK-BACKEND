const mongoose = require("mongoose");

// A Community is the joinable, listable unit shown in the app (e.g.
// "Kabianga CS", "Debate Club"). It can optionally wrap an existing
// Club or course rather than duplicating that data — linkedClubId/
// linkedCourseId are the bridge. Membership is NOT stored here (see
// CommunityMembership) except for the special 'university-wide' type,
// whose membership is computed at query time from user.universityId,
// never written as rows — avoids a write-storm / unbounded-growth
// problem for a community with tens of thousands of members.
const communitySchema = new mongoose.Schema({
  universityId: { type: String, required: true },
  name: { type: String, required: true },
  type: {
    type: String,
    enum: ["university-wide", "department", "course", "club", "interest"],
    required: true,
  },
  description: String,
  coverImageUrl: String,
  createdBy: { type: String, default: null }, // null for the system-created university-wide community
  isPublic: { type: Boolean, default: true },
  linkedClubId: { type: String, default: null },
  linkedCourseId: { type: String, default: null },
  // Makes the existing type: "department" category an explicit
  // relationship rather than a free-form label — a community typed
  // "department" can now point at a real Department document. Kept
  // nullable and independent of `type`: not every "department"-typed
  // community is required to link one (matches linkedClubId/
  // linkedCourseId, which are equally optional on their own types),
  // and nothing currently prevents setting this on a community of a
  // different type either — not enforced here on purpose, same
  // laxness as the two fields above it.
  linkedDepartmentId: { type: String, default: null },
  // Only ever populated on non-university-wide communities, and only
  // by a moderator/owner action — never automatic. Lets two
  // universities share a single community (e.g. a joint interest
  // group) without diluting the default, always-single-university
  // university-wide community.
  connectedUniversityIds: { type: [String], default: [] },
  createdAt: { type: Date, default: Date.now },
});

// Case-insensitive uniqueness on (universityId, name) — prevents five
// different "Kabianga CS" communities within the same university,
// same collation approach already used for University.name.
communitySchema.index(
  { universityId: 1, name: 1 },
  { unique: true, collation: { locale: "en", strength: 2 } }
);

module.exports = mongoose.model("Community", communitySchema);
