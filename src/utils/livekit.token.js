"use strict";

// A LiveKit access token is a signed JWT (HS256, signed with the API secret). Building it here with
// jsonwebtoken, which the backend already has, avoids a new dependency. The claims follow LiveKit's
// documented access-token format:
//   iss = the API key, sub = the participant identity, video = what the person may do in one room.
// A voice call may only publish a microphone; a video call a camera and a microphone.

const jwt = require("jsonwebtoken");

const DEFAULT_TTL_SEC = 60 * 60; // the token only has to be valid when the person joins

function buildAccessToken({ apiKey, apiSecret, identity, name, room, type, ttlSec = DEFAULT_TTL_SEC }) {
  if (!apiKey || !apiSecret) throw new Error("LiveKit is not configured");
  if (!identity || !room) throw new Error("identity and room are required");
  const sources = type === "video" ? ["camera", "microphone"] : ["microphone"];
  return jwt.sign(
    {
      name: name || String(identity),
      video: {
        room,
        roomJoin: true,
        canPublish: true,
        canSubscribe: true,
        canPublishData: true,
        canPublishSources: sources,
      },
    },
    apiSecret,
    { algorithm: "HS256", issuer: apiKey, subject: String(identity), expiresIn: ttlSec }
  );
}

// Reads the three LiveKit settings. Returns null when any is missing, so callers can say
// "calls are not set up yet" instead of failing deep inside a request.
function readLiveKitConfig(env = process.env) {
  const url = String(env.LIVEKIT_URL || "").trim();
  const apiKey = String(env.LIVEKIT_API_KEY || "").trim();
  const apiSecret = String(env.LIVEKIT_API_SECRET || "").trim();
  if (!url || !apiKey || !apiSecret) return null;
  if (!/^wss?:\/\//i.test(url)) return null; // the app connects with a websocket URL
  return { url, apiKey, apiSecret };
}

module.exports = { buildAccessToken, readLiveKitConfig, DEFAULT_TTL_SEC };
