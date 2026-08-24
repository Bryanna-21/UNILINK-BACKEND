require("dotenv").config();

const http = require("http");
const app = require("./app");
const mongoose = require("mongoose");
const { initSocketServer } = require("./socket");

// ============================================================
// ENVIRONMENT VALIDATION
// ============================================================

const requiredEnv = [
  "MONGO_URI",
  "JWT_SECRET",
];

const missingEnv = requiredEnv.filter(
  (key) => !process.env[key] || !process.env[key].trim()
);

if (missingEnv.length > 0) {
  console.error(
    `✗ Missing required environment variables: ${missingEnv.join(", ")}`
  );
  process.exit(1);
}

const isProduction = process.env.NODE_ENV === "production";

if (isProduction) {
  const productionEmailEnv = [
    "BREVO_API_KEY",
    "BREVO_SENDER_EMAIL",
  ];

  const missingProductionEmailEnv = productionEmailEnv.filter(
    (key) => !process.env[key] || !process.env[key].trim()
  );

  if (missingProductionEmailEnv.length > 0) {
    console.error(
      `✗ Missing production email environment variables: ${missingProductionEmailEnv.join(", ")}`
    );
    process.exit(1);
  }
}

const PORT = Number(process.env.PORT) || 5000;

if (!Number.isInteger(PORT) || PORT < 1 || PORT > 65535) {
  console.error("✗ Invalid PORT value");
  process.exit(1);
}

// ============================================================
// MONGODB CONNECTION
// ============================================================

async function connectDatabase() {
  try {
    await mongoose.connect(process.env.MONGO_URI, {
      maxPoolSize: 10,
      minPoolSize: 2,
      serverSelectionTimeoutMS: 10000,
      socketTimeoutMS: 45000,
    });

    console.log("✓ MongoDB Connected Successfully");
  } catch (error) {
    console.error("✗ MongoDB Connection Error:", error.message);
    process.exit(1);
  }
}

// ============================================================
// DATABASE EVENTS
// ============================================================

mongoose.connection.on("disconnected", () => {
  console.warn("⚠ MongoDB Disconnected");
});

mongoose.connection.on("error", (error) => {
  console.error("✗ MongoDB Error:", error.message);
});

mongoose.connection.on("reconnected", () => {
  console.log("✓ MongoDB Reconnected");
});

// ============================================================
// SERVER STARTUP
// ============================================================

async function startServer() {
  await connectDatabase();

  const server = http.createServer(app);

  // Initialize Socket.IO after the HTTP server exists.
  initSocketServer(server);

  server.listen(PORT, () => {
    console.log("\n" + "=".repeat(60));
    console.log("✓ UniLink Backend Server Running Successfully");
    console.log(`  🔹 Port: ${PORT}`);
    console.log(`  🔹 Environment: ${process.env.NODE_ENV || "development"}`);
    console.log("  🔹 Database: Connected");
    console.log("  🔹 Socket.IO: Enabled");
    console.log(`  🔹 Time: ${new Date().toISOString()}`);
    console.log("=".repeat(60) + "\n");
  });

  // ==========================================================
  // GRACEFUL SHUTDOWN
  // ==========================================================

  const shutdown = async (signal) => {
    console.log(`\n⚠ ${signal} signal received: closing server`);

    server.close(async () => {
      console.log("✓ HTTP server closed");

      try {
        await mongoose.connection.close();
        console.log("✓ MongoDB connection closed");
        process.exit(0);
      } catch (error) {
        console.error(
          "✗ Error closing MongoDB connection:",
          error.message
        );
        process.exit(1);
      }
    });
  };

  process.on("SIGTERM", () => shutdown("SIGTERM"));
  process.on("SIGINT", () => shutdown("SIGINT"));
}

// ============================================================
// PROCESS ERROR HANDLERS
// ============================================================

process.on("unhandledRejection", (reason) => {
  console.error("✗ Unhandled Promise Rejection:", reason);
});

process.on("uncaughtException", (error) => {
  console.error("✗ Uncaught Exception:", error);
  process.exit(1);
});

// ============================================================
// BOOT
// ============================================================

startServer().catch((error) => {
  console.error("✗ Fatal startup error:", error);
  process.exit(1);
});
