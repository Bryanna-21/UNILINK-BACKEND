"use strict";

// Phone numbers arrive in many shapes ("0712 345 678", "+254712345678", "254712345678"). To tell
// whether two of them are the same line, both are reduced to digits with the country code. A
// number starting with a single 0 is read as Kenyan (the app's home market): 0712345678 becomes
// 254712345678. Numbers written with their country code (+ or 00 in front) are kept as they are.

function normalizePhone(raw) {
  if (typeof raw !== "string" && typeof raw !== "number") return null;
  let text = String(raw).trim();
  const international = text.startsWith("+") || text.startsWith("00");
  let digits = text.replace(/\D/g, "");
  if (text.startsWith("00")) digits = digits.slice(2);
  if (!international && digits.startsWith("0") && !digits.startsWith("00")) digits = `254${digits.slice(1)}`;
  else if (!international && /^[17]\d{8}$/.test(digits)) digits = `254${digits}`;
  return digits.length >= 8 && digits.length <= 15 ? digits : null;
}

function samePhone(a, b) {
  const x = normalizePhone(a);
  return !!x && x === normalizePhone(b);
}

// The spellings a person might have saved, so a database query can find them. The caller still
// confirms each hit with samePhone, so a loose match here can never notify the wrong person.
function phoneVariants(raw) {
  const normal = normalizePhone(raw);
  if (!normal) return [];
  const variants = new Set([String(raw).trim(), normal, `+${normal}`]);
  if (normal.startsWith("254") && normal.length === 12) {
    variants.add(`0${normal.slice(3)}`);
    variants.add(normal.slice(3));
  }
  return [...variants];
}

// The form Twilio (and every phone network) needs: a + then the country code and the number, no
// spaces. People save numbers the way they dial them (0712 345 678), so this adds the country code.
function toE164(raw) {
  const normal = normalizePhone(raw);
  return normal ? `+${normal}` : null;
}

module.exports = { normalizePhone, samePhone, phoneVariants, toE164 };
