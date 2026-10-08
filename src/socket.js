const { Server } = require("socket.io");
const jwt = require("jsonwebtoken");
const Conversation = require("./models/Conversation");

let io = null;

// Attaches Socket.IO to the same HTTP server as the REST API.
// REST remains the source of truth for persisted messages.
// Socket.IO is used for ephemeral realtime events such as typing.
function initSocketServer(httpServer) {
  io = new Server(httpServer, {
    cors: {
      origin: "*",
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
    const userId = String(socket.user.id);

    // Preserve the existing admin notification room.
    if (socket.user.role === "admin") {
      socket.join("admins");
    }

    // Join a conversation's private realtime room.
    // Membership is checked against MongoDB before the socket is
    // allowed into the room. This prevents users from listening to
    // typing events for conversations they do not belong to.
    socket.on("conversation:join", async (conversationId, callback) => {
      try {
        if (!conversationId) {
          return callback?.({
            ok: false,
            message: "Conversation id is required",
          });
        }

        const conversation = await Conversation.findById(conversationId)
          .select("participantIds")
          .lean();

        if (!conversation) {
          return callback?.({
            ok: false,
            message: "Conversation not found",
          });
        }

        const isParticipant = conversation.participantIds.some(
          (id) => String(id) === userId
        );

        if (!isParticipant) {
          return callback?.({
            ok: false,
            message: "You are not a participant in this conversation",
          });
        }

        const room = `conversation:${String(conversationId)}`;
        socket.join(room);

        return callback?.({ ok: true });
      } catch (error) {
        console.error("Socket conversation join error:", error);
        return callback?.({
          ok: false,
          message: "Could not join conversation",
        });
      }
    });

    // Leave a conversation's realtime room.
    socket.on("conversation:leave", (conversationId) => {
      if (!conversationId) return;

      const room = `conversation:${String(conversationId)}`;

      socket.leave(room);
    });

    // Ephemeral typing event. Nothing is persisted.
    // Only sockets that successfully joined the conversation may emit
    // typing events into that conversation's room.
    socket.on("typing:start", (conversationId) => {
      if (!conversationId) return;

      const room = `conversation:${String(conversationId)}`;

      if (!socket.rooms.has(room)) return;

      socket.to(room).emit("typing:start", {
        conversationId: String(conversationId),
        userId,
      });
    });

    socket.on("typing:stop", (conversationId) => {
      if (!conversationId) return;

      const room = `conversation:${String(conversationId)}`;

      if (!socket.rooms.has(room)) return;

      socket.to(room).emit("typing:stop", {
        conversationId: String(conversationId),
        userId,
      });
    });
  });

  return io;
}

// Push a live event to connected admins.
// Kept for the existing admin notification system.
function emitToAdmins(event, payload) {
  if (!io) return;
  io.to("admins").emit(event, payload);
}

module.exports = { initSocketServer, emitToAdmins };
