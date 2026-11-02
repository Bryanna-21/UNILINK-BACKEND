"use strict";

// Emergency numbers by country. Pure, so it is tested without a database.
//
// IMPORTANT: a wrong number in an emergency screen can cost a life, so this table holds only
// numbers that are confirmed. Kenya is the home market. The other entries are the national
// numbers that are widely published; your client should confirm them before launch in each
// country. A country that is not listed gets 112, which GSM phones route to the local
// emergency service in most countries (it is not guaranteed everywhere, so the app says so).
//
// To add or correct a country WITHOUT a code change, set EMERGENCY_NUMBERS_JSON in Render, for
// example: {"KE":[{"name":"Emergency services","phone":"999"}]}. Entries that are not valid are
// ignored rather than shown.

const DEFAULT_COUNTRY = "KE";

const BUILT_IN = {
  KE: [
    { name: "Emergency services", phone: "999" },
    { name: "Mobile emergency", phone: "112" },
  ],
  UG: [
    { name: "Emergency services", phone: "999" },
    { name: "Mobile emergency", phone: "112" },
  ],
  TZ: [{ name: "Emergency services", phone: "112" }],
  RW: [{ name: "Emergency services", phone: "112" }],
  NG: [{ name: "Emergency services", phone: "112" }],
  GH: [{ name: "Emergency services", phone: "112" }],
  ZA: [
    { name: "Mobile emergency", phone: "112" },
    { name: "Police", phone: "10111" },
    { name: "Ambulance", phone: "10177" },
  ],
};

const FALLBACK = [{ name: "Mobile emergency", phone: "112" }];

const NAMES = {
  kenya: "KE",
  uganda: "UG",
  tanzania: "TZ",
  rwanda: "RW",
  nigeria: "NG",
  ghana: "GH",
  "south africa": "ZA",
};

// "Kenya", "kenya ", "KE" and "ke" all become "KE". Anything unrecognised becomes null.
function countryCode(value) {
  if (typeof value !== "string") return null;
  const t = value.trim();
  if (!t) return null;
  if (/^[A-Za-z]{2}$/.test(t)) return t.toUpperCase();
  return NAMES[t.toLowerCase()] || null;
}

const validPhone = (p) => typeof p === "string" && /^\+?\d{2,15}$/.test(p.trim());
const validName = (n) => typeof n === "string" && n.trim().length >= 1 && n.trim().length <= 40;

function cleanList(list) {
  if (!Array.isArray(list)) return [];
  return list
    .filter((e) => e && validName(e.name) && validPhone(e.phone))
    .map((e) => ({ name: e.name.trim(), phone: e.phone.trim() }));
}

// The override table from the environment, or {} when it is absent or unreadable.
function readOverrides(raw) {
  if (!raw || typeof raw !== "string") return {};
  try {
    const parsed = JSON.parse(raw);
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};
    const out = {};
    for (const [key, list] of Object.entries(parsed)) {
      const code = countryCode(key);
      const cleaned = cleanList(list);
      if (code && cleaned.length) out[code] = cleaned;
    }
    return out;
  } catch {
    return {};
  }
}

// { country, known, numbers } for a country name or code.
//   no country given at all -> Kenya (every institution in the catalogue is Kenyan today)
//   a country given but not listed -> the 112 fallback, known: false
function numbersFor(country, { overrides = readOverrides(process.env.EMERGENCY_NUMBERS_JSON) } = {}) {
  const wasGiven = typeof country === "string" && country.trim() !== "";
  const code = wasGiven ? countryCode(country) : DEFAULT_COUNTRY;
  if (code) {
    const list = overrides[code] || BUILT_IN[code];
    if (list) return { country: code, known: true, numbers: list.map((e) => ({ ...e })) };
  }
  return { country: code, known: false, numbers: FALLBACK.map((e) => ({ ...e })) };
}

module.exports = { DEFAULT_COUNTRY, BUILT_IN, FALLBACK, countryCode, readOverrides, numbersFor };
