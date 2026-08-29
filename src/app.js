const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");

const authRoutes = require("./routes/auth.routes");
const adminRoutes = require("./routes/admin.routes");
const aiRoutes = require("./routes/ai.routes");
const postRoutes = require("./routes/post.routes");
const emergencyRoutes = require("./routes/emergency.routes");
const courseRoutes = require("./routes/course.routes");
const communityRoutes = require("./routes/community.routes");
const eventRoutes = require("./routes/event.routes");
const marketplaceRoutes = require("./routes/marketplace.routes");
const lostAndFoundRoutes = require("./routes/lostAndFound.routes");
const libraryRoutes = require("./routes/library.routes");
const profileRoutes = require("./routes/profile.routes");
const messageRoutes = require("./routes/message.routes");
const examRoutes = require("./routes/exam.routes");

const app = express();

// ============================================================
// CORS
// ============================================================

const allowedOrigins = (process.env.CORS_ORIGINS || "")
  .split(",")
  .map((origin) => origin.trim())
  .filter(Boolean);

app.use(
  cors({
    origin: (origin, callback) => {
      // Allow mobile apps, Postman and server-to-server requests.
      if (!origin) {
        return callback(null, true);
      }

      // Development convenience.
      if (process.env.NODE_ENV !== "production") {
        return callback(null, true);
      }

      if (allowedOrigins.includes(origin)) {
        return callback(null, true);
      }

      return callback(new Error("CORS policy: origin not allowed"));
    },
    credentials: true,
  })
);

// ============================================================
// BODY PARSING
// ============================================================

app.use(express.json({ limit: "1mb" }));

app.use(
  express.urlencoded({
    extended: true,
    limit: "1mb",
  })
);

// ============================================================
// REQUEST LOGGING
// ============================================================

app.use((req, res, next) => {
  console.log(
    `[${new Date().toISOString()}] ${req.method} ${req.path}`
  );
  next();
});

// ============================================================
// ROUTES
// ============================================================

app.use("/api/auth", authRoutes);
app.use("/api/admin", adminRoutes);
app.use("/api/ai", aiRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/emergency", emergencyRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/community", communityRoutes);
app.use("/api/exams", examRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/marketplace", marketplaceRoutes);
app.use("/api/lost-and-found", lostAndFoundRoutes);
app.use("/api/library", libraryRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/messages", messageRoutes);

// ============================================================
// HEALTH CHECK
// ============================================================

app.get("/api/health", async (req, res) => {
  const mongoState = mongoose.connection.readyState;
  const databaseConnected = mongoState === 1;

  res.status(databaseConnected ? 200 : 503).json({
    status: databaseConnected ? "OK" : "DEGRADED",
    message: databaseConnected
      ? "UniLink backend is healthy"
      : "UniLink backend is running but database is unavailable",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development",
    database: databaseConnected ? "connected" : "disconnected",
  });
});

// ============================================================
// 404 HANDLER
// ============================================================

app.use((req, res) => {
  res.status(404).json({
    status: "error",
    message: "Route not found",
    path: req.path,
    method: req.method,
  });
});

// ============================================================
// ERROR HANDLER
// ============================================================

app.use((err, req, res, next) => {
  console.error("Error:", err);

  if (err.name === "MulterError") {
    return res.status(400).json({
      status: "error",
      message: "File upload error: " + err.message,
    });
  }

  if (err.message === "CORS policy: origin not allowed") {
    return res.status(403).json({
      status: "error",
      message: "Origin not allowed by CORS policy",
    });
  }

  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";

  res.status(status).json({
    status: "error",
    message,
    ...(process.env.NODE_ENV === "development" && {
      stack: err.stack,
    }),
  });
});

module.exports = app;
