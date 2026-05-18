const app = require("./app");
const mongoose = require("mongoose");
require("dotenv").config();

// MongoDB Connection with error handling
mongoose.connect(process.env.MONGO_URI)
  .then(() => {
    console.log("✓ MongoDB Connected Successfully");
  })
  .catch(err => {
    console.error("✗ MongoDB Connection Error:", err.message);
    process.exit(1);
  });

// Handle MongoDB disconnection
mongoose.connection.on('disconnected', () => {
  console.warn("⚠ MongoDB Disconnected");
});

mongoose.connection.on('error', (err) => {
  console.error("✗ MongoDB Error:", err.message);
});

const PORT = process.env.PORT || 5000;

const server = app.listen(PORT, () => {
  console.log(`\n${'='.repeat(50)}`);
  console.log(`✓ UniLink Backend Server Running`);
  console.log(`  Port: ${PORT}`);
  console.log(`  Environment: ${process.env.NODE_ENV || 'development'}`);
  console.log(`  Time: ${new Date().toISOString()}`);
  console.log(`${'='.repeat(50)}\n`);
});

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('\n⚠ SIGTERM received, shutting down gracefully...');
  server.close(() => {
    console.log('✓ Server closed');
    mongoose.connection.close(false, () => {
      console.log('✓ MongoDB connection closed');
      process.exit(0);
    });
  });
});

// Handle unhandled rejections
process.on('unhandledRejection', (reason, promise) => {
  console.error('✗ Unhandled Rejection at:', promise, 'reason:', reason);
});
