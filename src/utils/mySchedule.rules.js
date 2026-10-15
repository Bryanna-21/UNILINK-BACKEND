"use strict";

// Builds a person's weekly class list from their courses, the course timetables and (for students)
// their personal overrides. Pure, so it is tested without a database.
const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];

// "07:00" or "7:00" -> minutes after midnight, else null.
function parseTime(value) {
  const m = /^(\d{1,2}):(\d{2})$/.exec(typeof value === "string" ? value.trim() : "");
  if (!m) return null;
  const h = Number(m[1]);
  const min = Number(m[2]);
  return h < 24 && min < 60 ? h * 60 + min : null;
}

// courses: [{ _id, code, title }]; timetables: [{ _id, courseId, dayOfWeek, startTime, endTime, location }];
// overrides: [{ originalTimetableId, dayOfWeek, startTime, endTime, location }].
// A row with a bad day or time cannot be scheduled, so it is skipped and counted.
function mergeSessions({ courses, timetables, overrides = [] }) {
  const courseById = new Map(courses.map((c) => [String(c._id), c]));
  const overrideById = new Map(overrides.map((o) => [String(o.originalTimetableId), o]));
  const sessions = [];
  let skipped = 0;
  for (const t of timetables) {
    const course = courseById.get(String(t.courseId));
    if (!course) continue;
    const o = overrideById.get(String(t._id));
    const src = o || t;
    if (!DAYS.includes(src.dayOfWeek) || parseTime(src.startTime) === null || parseTime(src.endTime) === null) {
      skipped++;
      continue;
    }
    sessions.push({
      id: String(t._id),
      courseId: String(course._id),
      code: course.code,
      title: course.title,
      day: src.dayOfWeek,
      start: src.startTime.trim(),
      end: src.endTime.trim(),
      location: src.location || "",
      overridden: !!o,
    });
  }
  sessions.sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || parseTime(a.start) - parseTime(b.start) || a.code.localeCompare(b.code));
  return { sessions, skipped };
}

module.exports = { DAYS, parseTime, mergeSessions };
