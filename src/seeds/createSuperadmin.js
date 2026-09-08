const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");

mongoose.connect(process.env.MONGO_URI || "your-mongo-uri-here", {
  useNewUrlParser: true,
  useUnifiedTopology: true,
});

const db = mongoose.connection;

db.on("error", console.error.bind(console, "connection error:"));
db.once("open", async () => {
  try {
    const User = require("../models/user.model");

    const existing = await User.findOne({ email: "superadmin@unilink.local" });
    if (existing) {
      console.log("✓ Superadmin already exists");
      process.exit(0);
    }

    const hashedPassword = await bcrypt.hash("superadmin123", 10);

    const superadmin = await User.create({
      name: "Super Admin",
      email: "superadmin@unilink.local",
      password: hashedPassword,
      role: "superadmin",
      status: "active",
    });

    console.log("✓ Superadmin created successfully");
    console.log(`Email: ${superadmin.email}`);
    console.log(`Password: superadmin123`);
    console.log(`Role: ${superadmin.role}`);

    process.exit(0);
  } catch (error) {
    console.error("Error:", error.message);
    process.exit(1);
  }
});
