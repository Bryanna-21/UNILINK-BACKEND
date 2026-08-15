require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

const User = require("../src/models/User");

async function resetAdmin() {
  const email = (process.env.ADMIN_EMAIL || "").trim().toLowerCase();
  const password = process.env.ADMIN_PASSWORD || "";

  if (!email || !password) {
    throw new Error("ADMIN_EMAIL and ADMIN_PASSWORD environment variables are required.");
  }

  if (password.length < 8) {
    throw new Error("ADMIN_PASSWORD must be at least 8 characters long.");
  }

  if (!process.env.MONGO_URI) {
    throw new Error("MONGO_URI is not configured.");
  }

  await mongoose.connect(process.env.MONGO_URI);
  console.log("✓ Connected to MongoDB");

  const user = await User.findOne({ email });

  if (!user) {
    throw new Error(`No user found with email: ${email}`);
  }

  if (user.role !== "admin") {
    throw new Error(`Refusing to reset password because ${email} is not an admin.`);
  }

  user.password = await bcrypt.hash(password, 10);
  await user.save();

  console.log(`✓ Admin password reset successfully for ${email}`);
  console.log("✓ Account role was not changed.");
}

resetAdmin()
  .catch((error) => {
    console.error("✗ Admin password reset failed:");
    console.error(error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
