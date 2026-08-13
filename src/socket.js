const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");

let io = null;

// Attaches socket.io to the existing HTTP server created by app.listen()
// in server.js — deliberately NOT a second server on a second port,
// which would double CORS/deployment configuration for no benefit.
//
// Every socket must authenticate on connection with the same JWT used
// for REST requests, and only admins are allowed to join the
// "admins" room that admin-notification events are broadcast to.
// An unauthenticated or non-admin socket is disconnected immediately —
// this is a live admin-data feed, so it gets the same authorization
// bar as the REST /api/admin/* routes (see role.middleware.js).
function initSocketServer(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: "*", // matches the permissive REST CORS config in app.js;
      // see final report notes on tightening this with a real origin allowlist.
    },
  });

  io.use((socket, next) => {
    const token = socket.handshake.auth?.token;
    if (!token) {
      return next(new Error("Authentication required"));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.user = decoded;
      next();
    } catch (error) {
      next(new Error("Invalid or expired token"));
    }
  });

  io.on("connection", (socket) => {
    if (socket.user.role !== "admin") {
      socket.disconnect(true);
      return;
    }

    socket.join("admins");

    socket.on("disconnect", () => {
      // No explicit cleanup needed — socket.io removes the socket from
      // all rooms automatically on disconnect.
    });
  });

  return io;
}

// Called from controllers (see notifyAdmins.middleware.js) to push a
// live event to every connected admin, in addition to the persisted
// Notification document those admins will also see via REST on next
// load/poll. If socket.io hasn't been initialized (e.g. during tests
// that import controllers without booting the full server), this is a
// harmless no-op rather than a crash.
function emitToAdmins(event, payload) {
  if (!io) return;
  io.to("admins").emit(event, payload);
}

module.exports = { initSocketServer, emitToAdmins };
