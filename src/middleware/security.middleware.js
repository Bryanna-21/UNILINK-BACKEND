"use strict";

// Two small protections applied to every response (tests/security.test.js).
//
// securityHeaders: the standard browser-hardening headers. This is an API, so the content policy is "load nothing".
// scrubServerErrors: a server error (status 500 and up) used to send its internal message to the caller, such as a
//   database error text. The message is logged here instead and the caller gets a plain one. 4xx messages are
//   deliberate and stay as they are.

function securityHeaders(req, res, next) {
  res.set({
    "X-Content-Type-Options": "nosniff",
    "X-Frame-Options": "DENY",
    "Referrer-Policy": "no-referrer",
    "Strict-Transport-Security": "max-age=15552000; includeSubDomains",
    "Content-Security-Policy": "default-src 'none'; frame-ancestors 'none'",
    "Permissions-Policy": "geolocation=(), camera=(), microphone=()",
    "Cross-Origin-Opener-Policy": "same-origin",
  });
  // Sign-in responses carry tokens and codes: never let a browser or proxy keep them.
  if (req.path.startsWith("/api/auth")) res.set("Cache-Control", "no-store");
  next();
}

const GENERIC_5XX = "Something went wrong on our side. Please try again.";

function scrubServerErrors(req, res, next) {
  const original = res.json.bind(res);
  res.json = (body) => {
    if (res.statusCode >= 500 && body && typeof body === "object" && typeof body.message === "string" && body.message !== GENERIC_5XX) {
      console.error(`[${res.statusCode}] ${req.method} ${req.originalUrl}: ${body.message}`);
      return original({ ...body, message: GENERIC_5XX });
    }
    return original(body);
  };
  next();
}

module.exports = { securityHeaders, scrubServerErrors, GENERIC_5XX };
