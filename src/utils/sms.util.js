// Real Twilio integration, correct and ready, but inert until real
// credentials are set. Same pattern as config/cloudinary.js — a
// third-party service this backend depends on for one real feature,
// gated entirely behind env vars that don't ship with a working
// default (unlike JWT_SECRET, which has a documented insecure
// fallback for dev — there is no meaningful fallback for "send a
// real SMS").
//
// Without TWILIO_ACCOUNT_SID/TWILIO_AUTH_TOKEN/TWILIO_PHONE_NUMBER
// set, sendSOSAlert below returns { status: "not_configured" } for
// every contact rather than throwing — an SOS report must always
// succeed even if SMS can't be sent, same rationale as
// notifyAdmins.middleware.js swallowing its own failures.

const { toE164 } = require("./phone.rules");

let twilioClient = null;

function getTwilioClient() {
  if (twilioClient) return twilioClient;
  const { TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN } = process.env;
  if (!TWILIO_ACCOUNT_SID || !TWILIO_AUTH_TOKEN) return null;
  // Lazy require: the twilio package is a new dependency added for
  // this feature specifically — requiring it at module load time
  // would crash the whole server on boot for anyone running this
  // backend without it installed yet (e.g. before `npm install`
  // has been re-run after this change lands).
  const twilio = require("twilio");
  twilioClient = twilio(TWILIO_ACCOUNT_SID, TWILIO_AUTH_TOKEN);
  return twilioClient;
}

// Sends one SMS per contact, sequentially, and returns a per-contact
// status array rather than throwing on the first failure — one
// contact having an invalid/malformed number should never prevent
// the rest from being notified.
async function sendSOSAlert({ contacts, studentName, location }) {
  const client = getTwilioClient();
  const fromNumber = process.env.TWILIO_PHONE_NUMBER;

  if (!client || !fromNumber) {
    return contacts.map((c) => ({ name: c.name, phone: c.phone, smsStatus: "not_configured" }));
  }

  const body = `UniLink SOS Alert: ${studentName} has triggered an emergency alert${location ? ` near ${location}` : ""}. Please check on them immediately.`;

  const results = [];
  for (const contact of contacts) {
    // Twilio only accepts international format (+254712345678). People save a number the way they
    // dial it (0712 345 678), which Twilio refuses, so every number is put in that format first.
    const to = toE164(contact.phone);
    if (!to) {
      console.error(`✗ Trusted contact has a number that cannot be texted: ${contact.phone}`);
      results.push({ name: contact.name, phone: contact.phone, smsStatus: "failed" });
      continue;
    }

    try {
      await client.messages.create({ body, from: fromNumber, to });
      results.push({ name: contact.name, phone: contact.phone, smsStatus: "sent" });
    } catch (error) {
      console.error(`✗ Failed to SMS trusted contact ${contact.phone}:`, error.message);
      results.push({ name: contact.name, phone: contact.phone, smsStatus: "failed" });
    }
  }
  return results;
}

module.exports = { sendSOSAlert };
