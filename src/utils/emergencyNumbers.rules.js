"use strict";

// The emergency numbers shown to people in trouble. They are per country, because the right number
// to dial depends on where you are. A wrong number is worse than none, so:
//   - only Kenya is built in (999 for police, ambulance and fire; 112, the general emergency
//     number), the app's home market; the owner should still confirm it;
//   - every other country is added by a superadmin, who is responsible for it being right;
//   - a country with nothing configured has no numbers, and the screens say so rather than guess.

const DEFAULTS = {
  kenya: {
    country: "Kenya",
    numbers: [
      { label: "Police, ambulance and fire", number: "999" },
      { label: "General emergency (112)", number: "112" },
    ],
  },
};

// "  Kenya " / "KENYA" / "Kenya  " are one country.
function countryKey(name) {
  if (typeof name !== "string") return null;
  const key = name.trim().toLowerCase().replace(/\s+/g, " ");
  return key && key.length <= 60 ? key : null;
}

function cleanEntry(entry) {
  if (!entry || typeof entry.label !== "string" || typeof entry.number !== "string") return null;
  const label = entry.label.trim().replace(/\s+/g, " ");
  const number = entry.number.trim().replace(/\s+/g, " ");
  if (!label || label.length > 60) return null;
  // A dialable number: optional +, digits, single spaces between digit groups; 3 to 16 characters.
  if (!/^\+?[0-9](?:[0-9 ]{1,14})[0-9]$/.test(number)) return null;
  return { label, number };
}

// { ok, numbers } or { ok:false, message }. One to six numbers, every one valid, no repeats.
function validateNumbers(list) {
  if (!Array.isArray(list) || list.length < 1 || list.length > 6) {
    return { ok: false, message: "Give between 1 and 6 emergency numbers." };
  }
  const numbers = [];
  for (const entry of list) {
    const clean = cleanEntry(entry);
    if (!clean) {
      return { ok: false, message: "Each number needs a short name and a dialable number (digits, an optional + at the start)." };
    }
    if (numbers.some((n) => n.number.replace(/ /g, "") === clean.number.replace(/ /g, ""))) {
      return { ok: false, message: "The same number is listed twice." };
    }
    numbers.push(clean);
  }
  return { ok: true, numbers };
}

// What to show for a country: the superadmin's entry if there is one, else the built-in default,
// else nothing. `source` says which, so a screen can be honest about it.
function pickNumbers({ record, countryName }) {
  const key = countryKey(countryName);
  if (record && Array.isArray(record.numbers) && record.numbers.length > 0) {
    return { country: record.country || countryName, numbers: record.numbers.map(({ label, number }) => ({ label, number })), source: "database" };
  }
  if (key && DEFAULTS[key]) {
    return { country: DEFAULTS[key].country, numbers: DEFAULTS[key].numbers.map((n) => ({ ...n })), source: "default" };
  }
  return { country: countryName || null, numbers: [], source: "none" };
}

module.exports = { DEFAULTS, countryKey, cleanEntry, validateNumbers, pickNumbers };
