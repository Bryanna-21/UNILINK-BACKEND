"use strict";

// Notify everyone in a group (all students of a university, all lecturers, everyone) without
// holding a request open: it runs after the response is sent, in batches of 500 people.
const User = require("../models/User");
const notifyUsers = require("../middleware/notifyUsers.middleware");
const { buildAudienceFilter } = require("../utils/audience.rules");

const BATCH = 500;
const HARD_LIMIT = 200000;

async function notifyAudience({ universityId, campusId, roles, type, title, message, link, context }) {
  try {
    const filter = buildAudienceFilter({ universityId, campusId, roles });
    let lastId = null;
    let total = 0;
    while (total < HARD_LIMIT) {
      const page = await User.find(lastId ? { ...filter, _id: { $gt: lastId } } : filter).select("_id").sort({ _id: 1 }).limit(BATCH).lean();
      if (!page.length) break;
      await notifyUsers({ recipientIds: page.map((u) => String(u._id)), type, title, message, link, context });
      lastId = page[page.length - 1]._id;
      total += page.length;
    }
    return total;
  } catch (error) {
    console.error("[notifyAudience] failed:", error.message);
    return 0;
  }
}

// Returns immediately; the sending carries on in the background.
function notifyAudienceInBackground(args) {
  setImmediate(() => {
    notifyAudience(args).catch(() => {});
  });
}

// A lecturer who adds several class slots in a row should not buy each student several pushes.
const lastScheduleNotice = new Map();
const SCHEDULE_NOTICE_GAP_MS = 10 * 60 * 1000;
function notifyScheduleChange(course) {
  const key = String(course._id);
  const now = Date.now();
  if (now - (lastScheduleNotice.get(key) || 0) < SCHEDULE_NOTICE_GAP_MS) return;
  lastScheduleNotice.set(key, now);
  notifyUsers({
    recipientIds: course.enrolledStudentIds || [],
    type: "schedule_change",
    title: `${course.code}: class times changed`,
    message: "Open UniLink to refresh your class reminders.",
    link: `/course/${course._id}`,
    context: { courseId: String(course._id) },
  }).catch(() => {});
}

module.exports = { notifyAudience, notifyAudienceInBackground, notifyScheduleChange };
