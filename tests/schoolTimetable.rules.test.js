const test = require("node:test");
const assert = require("node:assert/strict");
const t = require("../src/utils/schoolTimetable.rules");

const row = (o = {}) => ({ day: "Monday", start: "08:00", end: "10:00", unitCode: "CS101", unitName: "Intro", lecturer: "Dr Achieng", room: "A1", ...o });

test("valid rows are normalised and sorted by day then start time", () => {
  const r = t.parseEntries([row({ day: "Wednesday" }), row({ start: "11:00", end: "12:00", unitCode: "B" }), row({ start: "08:00", end: "09:00", unitCode: "A", unitName: "", lecturer: "", room: "" })]);
  assert.equal(r.ok, true);
  assert.deepEqual(r.entries.map((e) => `${e.day} ${e.start}`), ["Monday 08:00", "Monday 11:00", "Wednesday 08:00"]);
  assert.equal(r.entries[0].room, "");
});

test("bad rows are rejected and name the row", () => {
  assert.match(t.parseEntries([row(), row({ day: "Funday" })]).message, /^Row 2: choose a day/);
  assert.match(t.parseEntries([row({ start: "8:00" })]).message, /Row 1: times must look like 08:00/);
  assert.match(t.parseEntries([row({ start: "24:00", end: "25:00" })]).message, /times must look like/);
  assert.match(t.parseEntries([row({ start: "10:00", end: "10:00" })]).message, /end time must be after/);
  assert.match(t.parseEntries([row({ start: "11:00", end: "09:00" })]).message, /end time must be after/);
  assert.match(t.parseEntries([row({ unitCode: "  " })]).message, /unit code is required/);
  assert.match(t.parseEntries([row({ room: "x".repeat(61) })]).message, /room is too long/);
  assert.equal(t.parseEntries("nope").ok, false);
  assert.equal(t.parseEntries([null]).ok, false);
  assert.equal(t.parseEntries(Array(301).fill(row())).ok, false);
});

test("an empty timetable parses (a draft may be empty)", () => {
  assert.deepEqual(t.parseEntries([]), { ok: true, entries: [] });
});

test("room and lecturer clashes are found; back-to-back and different days are not clashes", () => {
  const a = row();
  assert.equal(t.findConflicts([a, row({ start: "09:00", end: "11:00", unitCode: "X", lecturer: "Other" })]).map((c) => c.type).join(), "room");
  assert.equal(t.findConflicts([a, row({ start: "09:00", end: "11:00", unitCode: "X", room: "B2" })]).map((c) => c.type).join(), "lecturer");
  assert.equal(t.findConflicts([a, row({ start: "09:00", end: "11:00", unitCode: "X" })]).length, 2);
  assert.equal(t.findConflicts([a, row({ start: "10:00", end: "12:00", unitCode: "X" })]).length, 0);
  assert.equal(t.findConflicts([a, row({ day: "Tuesday", unitCode: "X" })]).length, 0);
  assert.equal(t.findConflicts([row({ room: "", lecturer: "" }), row({ room: " ", lecturer: "", unitCode: "X" })]).length, 0);
  assert.equal(t.findConflicts([a, row({ room: " a1 ", lecturer: "Other", unitCode: "X" })]).length, 1);
});

test("only draft and published timetables can be edited, and editing a published one starts a new round", () => {
  assert.equal(t.canEdit("draft"), true);
  assert.equal(t.canEdit("published"), true);
  assert.equal(t.canEdit("finalized"), false);
  assert.equal(t.versionAfterEdit("draft", 1), 1);
  assert.equal(t.versionAfterEdit("published", 1), 2);
});

test("tally counts votes and never goes negative for pending", () => {
  const votes = [{ vote: "approve" }, { vote: "approve" }, { vote: "object" }];
  assert.deepEqual(t.tally(votes, 10), { approve: 2, object: 1, responded: 3, pending: 7 });
  assert.deepEqual(t.tally(votes, 2), { approve: 2, object: 1, responded: 3, pending: 0 });
  assert.deepEqual(t.tally([], 0), { approve: 0, object: 0, responded: 0, pending: 0 });
});

test("votes: an objection needs a reason; an approval may have one", () => {
  assert.deepEqual(t.parseVote({ vote: "approve" }), { ok: true, vote: "approve", reason: "" });
  assert.deepEqual(t.parseVote({ vote: "approve", reason: " fine " }), { ok: true, vote: "approve", reason: "fine" });
  assert.equal(t.parseVote({ vote: "object" }).ok, false);
  assert.equal(t.parseVote({ vote: "object", reason: "   " }).ok, false);
  assert.equal(t.parseVote({ vote: "object", reason: "Clashes with my other class" }).ok, true);
  assert.equal(t.parseVote({ vote: "maybe" }).ok, false);
  assert.equal(t.parseVote(null).ok, false);
  assert.equal(t.parseVote({ vote: "approve", reason: "x".repeat(501) }).ok, false);
});

// ---- window and per-role tallies (timetable v2) ----------------------------------------------
const DAY = 24 * 60 * 60 * 1000;
const PUB = new Date("2026-11-02T09:00:00Z");

test("publishing opens a 14 day window that closes by itself", () => {
  assert.equal(t.windowCloseAt(PUB).toISOString(), "2026-11-16T09:00:00.000Z");
  const tt = { status: "published", publishedAt: PUB, suggestionsCloseAt: t.windowCloseAt(PUB) };
  assert.equal(t.isWindowOpen(tt, new Date(PUB.getTime() + 13 * DAY)), true);
  assert.equal(t.isWindowOpen(tt, new Date(PUB.getTime() + 14 * DAY)), false, "closed at the exact close time");
  assert.equal(t.isWindowOpen({ status: "draft" }, PUB), false);
  assert.equal(t.isWindowOpen({ status: "finalized", publishedAt: PUB }, PUB), false);
});

test("an older record without a stored close time derives it from the publish time", () => {
  assert.equal(t.closeAtOf({ status: "published", publishedAt: PUB }).toISOString(), "2026-11-16T09:00:00.000Z");
  assert.equal(t.closeAtOf({ status: "draft" }), null);
  assert.equal(t.isWindowOpen({ status: "published", publishedAt: PUB }, new Date(PUB.getTime() + DAY)), true);
});

test("finalizing waits for the window to close, so the two weeks are always honoured", () => {
  const tt = { status: "published", publishedAt: PUB, suggestionsCloseAt: t.windowCloseAt(PUB) };
  const early = t.canFinalize(tt, new Date(PUB.getTime() + 5 * DAY));
  assert.equal(early.ok, false);
  assert.equal(early.reason, "window_open");
  assert.equal(early.closeAt.toISOString(), "2026-11-16T09:00:00.000Z");
  assert.equal(t.canFinalize(tt, new Date(PUB.getTime() + 14 * DAY)).ok, true);
  assert.equal(t.canFinalize({ status: "draft" }, PUB).reason, "not_published");
  assert.equal(t.canFinalize({ status: "finalized", publishedAt: PUB }, PUB).reason, "not_published");
});

test("a revision guarantees at least 7 more days and never shortens an open window", () => {
  const now = new Date("2026-11-14T09:00:00Z");
  assert.equal(t.closeAtAfterRevision(new Date("2026-11-16T09:00:00Z"), now).toISOString(), "2026-11-21T09:00:00.000Z", "2 days left becomes 7");
  assert.equal(t.closeAtAfterRevision(new Date("2026-11-30T09:00:00Z"), now).toISOString(), "2026-11-30T09:00:00.000Z", "a longer window is kept");
  assert.equal(t.closeAtAfterRevision(null, now).toISOString(), "2026-11-21T09:00:00.000Z");
});

test("lecturers and students are counted separately", () => {
  const votes = [
    { vote: "approve", role: "lecturer" }, { vote: "object", role: "lecturer" },
    { vote: "approve", role: "student" }, { vote: "approve", role: "student" }, { vote: "object", role: "student" },
  ];
  assert.deepEqual(t.tallyByRole(votes, { lecturer: 5, student: 100 }), {
    lecturer: { approve: 1, object: 1, responded: 2, pending: 3 },
    student: { approve: 2, object: 1, responded: 3, pending: 97 },
  });
  assert.deepEqual(t.tallyByRole([], { lecturer: 0, student: 0 }).student, { approve: 0, object: 0, responded: 0, pending: 0 });
});
