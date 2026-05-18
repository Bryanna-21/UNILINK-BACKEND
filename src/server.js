const app = require("./app");
const mongoose = require("mongoose");
require("dotenv").config();

// Validate environment variables
if (!process.env.MONGO_URI) {
  console.error("✗ Error: MONGO_URI environment variable is not set");
  process.exit(1);
}

if (!process.env.JWT_SECRET) {
  console.warn("⚠ Warning: JWT_SECRET not set, using default value");
}

// MongoDB Connection with comprehensive error handling
mongoose.connect(process.env.MONGO_URI, {
  useNewUrlParser: true,
  useUnifiedTopology: true,
  maxPoolSize: 10,
  serverSelectionTimeoutMS: 5000,
  socketTimeoutMS: 45000
})
  .then(() => {
    console.log("✓ MongoDB Connected Successfully");
  })
  .catch(err => {
    console.error("✗ MongoDB Connection Error:", err.message);
    console.error("Attempting to continue without database...");
  });

// Handle MongoDB disconnection events
mongoose.connection.on('disconnected', () => {
  console.warn("⚠ MongoDB Disconnected");
});

mongoose.connection.on('error', (err) => {
  console.error("✗ MongoDB Error:", err.message);
});

mongoose.connection.on('reconnected', () => {
  console.log("✓ MongoDB Reconnected");
});

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`\n${'='.repeat(60)}`);
  console.log(`✓ UniLink Backend Server Running Successfully");
  console.log(`  🔹 Port: ${PORT}`);
  console.log(`  🔹 Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`  🔹 Time: ${new Date().toISOString()}`);
  console.log(`  🔹 Database: ${process.env.MONGO_URI ? 'Connected' : 'Not configured'}`);
  console.log(`${'='.repeat(60)}\n`);
});

// Graceful shutdown handling
process.on('SIGTERM', () => {
  console.log('\n⚠ SIGTERM signal received: closing HTTP server');
  server.close(() => {
    console.log('✓ HTTP server closed');
    mongoose.connection.close(false, () => {
      console.log('✓ MongoDB connection closed');
      process.exit(0);
    });
  });
});

process.on('SIGINT', () => {
  console.log('\n⚠ SIGINT signal received: closing HTTP server');
  server.close(() => {
    console.log('✓ HTTP server closed');
    mongoose.connection.close(false, () => {
      console.log('✓ MongoDB connection closed');
      process.exit(0);
    });
  });
});

// Handle unhandled promise rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('✗ Unhandled Rejection at:', promise, 'Reason:', reason);
});

// Handle uncaught exceptions
process.on('uncaughtException', (error) => {
  console.error('✗ Uncaught Exception:', error.message);
  process.exit(1);
});
