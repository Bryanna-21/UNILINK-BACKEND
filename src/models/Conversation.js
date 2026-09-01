const mongoose = require("mongoose");

// type "direct": always exactly 2 participantIds, created/found via
// otherUserId, no title needed.
// type "course": opt-in group chat tied to a course — participantIds
// only ever contains users who explicitly joined, NOT auto-populated
// from Course.enrolledStudentIds. courseId is set, title inherited
// from the course unless overridden.
// type "group": standalone discussion group, not tied to any course.
// courseId stays null. title is required (no course to inherit a
// name from). Creation is open to any authenticated user — there's
// no enrollment concept to gate against for a standalone group.
const conversationSchema = new mongoose.Schema({
  type: { type: String, enum: ["direct", "course", "group"], default: "direct" },
  participantIds: { type: [String], required: true },
  courseId: { type: String, default: null },
  title: { type: String, default: null },
  createdBy: { type: String, default: null }, // set for type "group"; who created it
  lastMessageAt: { type: Date, default: Date.now },
  createdAt: { type: Date, default: Date.now },
});

module.exports = mongoose.model("Conversation", conversationSchema);
