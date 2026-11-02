"use strict";

// Trusted contacts get an SMS when the student sends an SOS, so a bad number is either a
// silent failure (nobody warned) or money wasted. These rules keep the list clean. Pure.
//
// SMS needs international format (+254712345678). Kenyan students type 0712345678, so a local
// 10-digit number starting with 0 is read as Kenyan. Any other country must start with + or 00.

const MAX_CONTACTS = 5;

function normalizePhone(raw) {
  if (typeof raw !== "string") return null;
  const s = raw.trim().replace(/[\s\-().]/g, "");
  if (/^\+[1-9]\d{7,14}$/.test(s)) return s;
  if (/^00[1-9]\d{7,14}$/.test(s)) return `+${s.slice(2)}`;
  if (/^254[17]\d{8}$/.test(s)) return `+${s}`;
  if (/^0[17]\d{8}$/.test(s)) return `+254${s.slice(1)}`;
  return null;
}

// { ok:true, contact } or { ok:false, status, message }.
function validateNewContact(input, existing) {
  const name = typeof input?.name === "string" ? input.name.trim() : "";
  if (!name || name.length > 60) return { ok: false, status: 400, message: "Enter the contact's name (up to 60 letters)." };

  const phone = normalizePhone(input?.phone);
  if (!phone) {
    return { ok: false, status: 400, message: "Enter a valid phone number, for example 0712345678 or +254712345678." };
  }

  const relationship = typeof input?.relationship === "string" ? input.relationship.trim().slice(0, 30) : "";
  const list = Array.isArray(existing) ? existing : [];
  if (list.length >= MAX_CONTACTS) {
    return { ok: false, status: 409, message: `You can have up to ${MAX_CONTACTS} trusted contacts. Remove one first.` };
  }
  if (list.some((c) => normalizePhone(c?.phone) === phone)) {
    return { ok: false, status: 409, message: "That number is already one of your trusted contacts." };
  }
  return { ok: true, contact: { name, phone, relationship } };
}

// Contacts saved before these rules existed may hold local numbers. Fix them at send time so the
// SMS still goes out; a number that cannot be read is passed through untouched.
function normalizeContactPhones(contacts) {
  if (!Array.isArray(contacts)) return [];
  return contacts.map((c) => {
    const phone = normalizePhone(c?.phone);
    const plain = typeof c?.toObject === "function" ? c.toObject() : c;
    return phone ? { ...plain, phone } : plain;
  });
}

module.exports = { MAX_CONTACTS, normalizePhone, validateNewContact, normalizeContactPhones };
