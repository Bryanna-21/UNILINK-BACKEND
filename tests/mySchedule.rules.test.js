const test = require("node:test");
const assert = require("node:assert/strict");
const { parseTime, mergeSessions } = require("../src/utils/mySchedule.rules");

const courses = [{ _id: "c1", code: "CS101", title: "Intro" }, { _id: "c2", code: "MA201", title: "Calculus" }];
const tt = (o) => ({ _id: "t" + Math.random(), courseId: "c1", dayOfWeek: "Monday", startTime: "08:00", endTime: "10:00", location: "A1", ...o });

test("times parse with or without a leading zero, and bad ones are rejected", () => {
  assert.equal(parseTime("07:00"), 420);
  assert.equal(parseTime("7:05"), 425);
  assert.equal(parseTime(" 23:59 "), 1439);
  for (const bad of ["24:00", "12:60", "8", "8am", "", null, undefined, 800]) assert.equal(parseTime(bad), null, String(bad));
});

test("sessions are sorted by day then start time and carry the course details", () => {
  const { sessions } = mergeSessions({ courses, timetables: [tt({ _id: "a", dayOfWeek: "Wednesday" }), tt({ _id: "b", startTime: "11:00", endTime: "12:00", courseId: "c2" }), tt({ _id: "c" })] });
  assert.deepEqual(sessions.map((s) => `${s.day} ${s.start} ${s.code}`), ["Monday 08:00 CS101", "Monday 11:00 MA201", "Wednesday 08:00 CS101"]);
  assert.equal(sessions[0].title, "Intro");
});

test("a student's override replaces the class time and is flagged", () => {
  const { sessions } = mergeSessions({
    courses,
    timetables: [tt({ _id: "t1" })],
    overrides: [{ originalTimetableId: "t1", dayOfWeek: "Tuesday", startTime: "14:00", endTime: "16:00", location: "B2" }],
  });
  assert.deepEqual(sessions[0], { id: "t1", courseId: "c1", code: "CS101", title: "Intro", day: "Tuesday", start: "14:00", end: "16:00", location: "B2", overridden: true });
});

test("rows that cannot be scheduled are skipped and counted; unknown courses are ignored", () => {
  const r = mergeSessions({ courses, timetables: [tt({ _id: "ok" }), tt({ _id: "bad1", startTime: "soon" }), tt({ _id: "bad2", dayOfWeek: "Funday" }), tt({ _id: "other", courseId: "nope" })] });
  assert.deepEqual(r.sessions.map((s) => s.id), ["ok"]);
  assert.equal(r.skipped, 2);
});

test("a missing location becomes an empty string and nothing breaks on empty input", () => {
  assert.equal(mergeSessions({ courses, timetables: [tt({ location: undefined })] }).sessions[0].location, "");
  assert.deepEqual(mergeSessions({ courses: [], timetables: [] }), { sessions: [], skipped: 0 });
});
