"use strict";

// Rules for the school timetable that admins write and lecturers debate. Pure, so they are tested
// without a database.
const { cleanText } = require("./adminScope");

const DAYS = ["Monday", "Tuesday", "Wednesday", "Thursday", "Friday", "Saturday", "Sunday"];
const STATUSES = ["draft", "published", "finalized"];
const MAX_ENTRIES = 300;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;
const minutes = (t) => {
  const [h, m] = t.split(":").map(Number);
  return h * 60 + m;
};

// Validates and normalises the rows. Returns { ok, entries } (sorted by day then start time) or
// { ok: false, message } naming the first bad row.
function parseEntries(raw) {
  if (!Array.isArray(raw)) return { ok: false, message: "The timetable rows must be a list." };
  if (raw.length > MAX_ENTRIES) return { ok: false, message: `A timetable can have at most ${MAX_ENTRIES} rows.` };
  const entries = [];
  for (let i = 0; i < raw.length; i++) {
    const e = raw[i];
    const row = `Row ${i + 1}`;
    if (!e || typeof e !== "object") return { ok: false, message: `${row}: is not valid.` };
    if (!DAYS.includes(e.day)) return { ok: false, message: `${row}: choose a day.` };
    if (typeof e.start !== "string" || !TIME_RE.test(e.start) || typeof e.end !== "string" || !TIME_RE.test(e.end)) {
      return { ok: false, message: `${row}: times must look like 08:00.` };
    }
    if (minutes(e.end) <= minutes(e.start)) return { ok: false, message: `${row}: the end time must be after the start time.` };
    const unitCode = cleanText(e.unitCode, 20);
    if (!unitCode) return { ok: false, message: `${row}: a unit code is required (20 characters at most).` };
    const opt = (v, max, what) => {
      if (v === undefined || v === null || v === "") return { value: "" };
      const t = cleanText(v, max);
      return t ? { value: t } : { error: `${row}: ${what} is too long (${max} characters at most).` };
    };
    const unitName = opt(e.unitName, 100, "the unit name");
    if (unitName.error) return { ok: false, message: unitName.error };
    const lecturer = opt(e.lecturer, 100, "the lecturer");
    if (lecturer.error) return { ok: false, message: lecturer.error };
    const room = opt(e.room, 60, "the room");
    if (room.error) return { ok: false, message: room.error };
    entries.push({ day: e.day, start: e.start, end: e.end, unitCode, unitName: unitName.value, lecturer: lecturer.value, room: room.value });
  }
  entries.sort((a, b) => DAYS.indexOf(a.day) - DAYS.indexOf(b.day) || minutes(a.start) - minutes(b.start) || a.unitCode.localeCompare(b.unitCode));
  return { ok: true, entries };
}

// Clashes: two rows on the same day whose times overlap and that share a room or a lecturer.
function findConflicts(entries) {
  const out = [];
  const norm = (s) => (s || "").trim().toLowerCase();
  for (let i = 0; i < entries.length; i++) {
    for (let j = i + 1; j < entries.length; j++) {
      const a = entries[i];
      const b = entries[j];
      if (a.day !== b.day) continue;
      if (!(minutes(a.start) < minutes(b.end) && minutes(b.start) < minutes(a.end))) continue;
      if (norm(a.room) && norm(a.room) === norm(b.room)) out.push({ type: "room", day: a.day, a, b });
      if (norm(a.lecturer) && norm(a.lecturer) === norm(b.lecturer)) out.push({ type: "lecturer", day: a.day, a, b });
    }
  }
  return out;
}

const canEdit = (status) => status === "draft" || status === "published";
// Editing a published timetable starts a new round: the version rises and earlier votes stop counting.
const versionAfterEdit = (status, version) => (status === "published" ? version + 1 : version);

function tally(votes, lecturerCount) {
  const approve = votes.filter((v) => v.vote === "approve").length;
  const object = votes.filter((v) => v.vote === "object").length;
  const responded = approve + object;
  return { approve, object, responded, pending: Math.max(0, lecturerCount - responded) };
}

// A vote is approve or object. An objection must say why.
function parseVote(body) {
  const vote = body && body.vote;
  if (vote !== "approve" && vote !== "object") return { ok: false, message: "Choose approve or object." };
  const has = body.reason !== undefined && body.reason !== null && body.reason !== "";
  const reason = has ? cleanText(body.reason, 500) : "";
  if (has && !reason) return { ok: false, message: "The reason is too long (500 characters at most)." };
  if (vote === "object" && !reason) return { ok: false, message: "Say what you object to, so the timetable can be fixed." };
  return { ok: true, vote, reason: reason || "" };
}

module.exports = { DAYS, STATUSES, MAX_ENTRIES, parseEntries, findConflicts, canEdit, versionAfterEdit, tally, parseVote };
