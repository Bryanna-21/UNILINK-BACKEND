const express = require("express");
const cors = require("cors");

const authRoutes = require("./routes/auth.routes");
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

const app = express();

// Middleware
app.use(cors());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Request logging middleware
app.use((req, res, next) => {
  console.log(`[${new Date().toISOString()}] ${req.method} ${req.path}`);
  next();
});

// Routes
app.use("/api/auth", authRoutes);
app.use("/api/posts", postRoutes);
app.use("/api/emergency", emergencyRoutes);
app.use("/api/courses", courseRoutes);
app.use("/api/community", communityRoutes);
app.use("/api/events", eventRoutes);
app.use("/api/marketplace", marketplaceRoutes);
app.use("/api/lost-and-found", lostAndFoundRoutes);
app.use("/api/library", libraryRoutes);
app.use("/api/profile", profileRoutes);
app.use("/api/messages", messageRoutes);

// Health check endpoint
app.get("/api/health", (req, res) => {
  res.status(200).json({
    status: "OK",
    message: "Server is running",
    timestamp: new Date().toISOString(),
    environment: process.env.NODE_ENV || "development"
  });
});

// 404 handler
app.use((req, res) => {
  res.status(404).json({
    status: "error",
    message: "Route not found",
    path: req.path,
    method: req.method
  });
});

// Error handling middleware
app.use((err, req, res, next) => {
  console.error("Error:", err);

  // Multer errors (file too large, wrong field, etc.) have a
  // recognizable shape distinct from normal thrown errors — handle
  // them with a clear 400 instead of falling through to a generic 500.
  if (err.name === "MulterError") {
    return res.status(400).json({
      status: "error",
      message: "File upload error: " + err.message
    });
  }

  const status = err.status || err.statusCode || 500;
  const message = err.message || "Internal Server Error";
  
  res.status(status).json({
    status: "error",
    message: message,
    ...(process.env.NODE_ENV === "development" && { stack: err.stack })
  });
});

module.exports = app;
