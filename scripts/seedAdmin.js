// Secure bootstrap for the first admin account.
//
// Public /register can only ever create "student" accounts (see
// src/routes/auth.routes.js). This script is the ONLY sanctioned way to
// create an admin account from the command line.
//
// Usage:
//   ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=xxxxx ADMIN_NAME="Bryanna" node scripts/seedAdmin.js
//
// Or add ADMIN_EMAIL / ADMIN_PASSWORD / ADMIN_NAME to your .env (which is
// already gitignored) and run:
//   npm run seed:admin
//
// Safe to re-run: if the admin account already exists, it reports that and
// exits without modifying anything (it will NOT silently reset the
// password of an existing account — that would be its own vulnerability,
// letting anyone who gets shell/env access silently take over an existing
// admin login).

require("dotenv").config();
const mongoose = require("mongoose");
const bcryptjs = require("bcryptjs");
const User = require("../src/models/User");

async function main() {
  const email = process.env.ADMIN_EMAIL;
  const password = process.env.ADMIN_PASSWORD;
  const name = process.env.ADMIN_NAME || "Administrator";

  if (!email || !password) {
    console.error(
      "✗ Missing ADMIN_EMAIL and/or ADMIN_PASSWORD environment variables."
    );
    console.error(
      "  Set them in your .env file or pass them inline, e.g.:\n" +
        '  ADMIN_EMAIL=you@example.com ADMIN_PASSWORD=xxxxx node scripts/seedAdmin.js'
    );
    process.exit(1);
  }

  if (password.length < 6) {
    console.error("✗ ADMIN_PASSWORD must be at least 6 characters long.");
    process.exit(1);
  }

  if (!process.env.MONGO_URI) {
    console.error("✗ MONGO_URI environment variable is not set.");
    process.exit(1);
  }

  await mongoose.connect(process.env.MONGO_URI, {
    serverSelectionTimeoutMS: 5000,
  });
  console.log("✓ Connected to MongoDB");

  try {
    const existing = await User.findOne({ email });

    if (existing) {
      if (existing.role === "admin") {
        console.log(`✓ Admin account already exists for ${email}. No changes made.`);
      } else {
        console.error(
          `✗ A user with email ${email} already exists with role "${existing.role}".\n` +
            `  This script will not overwrite an existing account's role or password.\n` +
            `  Promote manually in the database if this is intentional, or use a different email.`
        );
        process.exitCode = 1;
      }
      return;
    }

    const hashedPassword = await bcryptjs.hash(password, 10);

    await User.create({
      name,
      email,
      password: hashedPassword,
      role: "admin",
    });

    console.log(`✓ Admin account created successfully for ${email}`);
    console.log("  You can now log in to the Admin Panel with these credentials.");
  } finally {
    await mongoose.disconnect();
  }
}

main().catch((err) => {
  console.error("✗ Seed script failed:", err.message);
  process.exit(1);
});
