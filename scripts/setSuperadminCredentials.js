// Changes the superadmin's email and password, and signs out every existing session.
// The password is read from the environment and is never written to a file or printed.
//
//   export NEW_SUPERADMIN_EMAIL=someone@example.com
//   read -rs -p "New password: " NEW_SUPERADMIN_PASSWORD; echo; export NEW_SUPERADMIN_PASSWORD
//   node scripts/setSuperadminCredentials.js            # dry run: shows what would change
//   node scripts/setSuperadminCredentials.js --confirm  # applies it
//
// Optional: CURRENT_SUPERADMIN_EMAIL picks the account when more than one superadmin exists.
// Uses MONGO_URI from the environment or .env, so check it points at the database Render uses.

require("dotenv").config();
const mongoose = require("mongoose");
const bcrypt = require("bcryptjs");
const User = require("../src/models/User");

async function main() {
  const newEmail = (process.env.NEW_SUPERADMIN_EMAIL || "").trim().toLowerCase();
  const newPassword = process.env.NEW_SUPERADMIN_PASSWORD || "";
  const currentEmail = (process.env.CURRENT_SUPERADMIN_EMAIL || "").trim().toLowerCase();
  const confirm = process.argv.includes("--confirm");

  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(newEmail)) throw new Error("NEW_SUPERADMIN_EMAIL is missing or not a valid email.");
  if (newPassword.length < 8) throw new Error("NEW_SUPERADMIN_PASSWORD must be at least 8 characters long.");
  if (!process.env.MONGO_URI) throw new Error("MONGO_URI is not configured.");

  await mongoose.connect(process.env.MONGO_URI);
  console.log("Connected to MongoDB");

  const matches = currentEmail
    ? await User.find({ email: currentEmail, role: "superadmin" })
    : await User.find({ role: "superadmin" });
  if (matches.length === 0) throw new Error("No superadmin account found.");
  if (matches.length > 1) throw new Error("More than one superadmin exists. Set CURRENT_SUPERADMIN_EMAIL to choose one.");
  const target = matches[0];

  const taken = await User.findOne({ email: newEmail, _id: { $ne: target._id } }).select("_id");
  if (taken) throw new Error("That email already belongs to a different account. Nothing was changed.");

  console.log("Superadmin:", target.email, "->", newEmail);
  console.log("Password will be replaced, and all existing sessions will be signed out.");
  if (newPassword.length < 12 || /^[a-z]+\d{4}$/i.test(newPassword)) {
    console.log("WARNING: this password is short or follows a guessable pattern. Prefer 12+ characters.");
  }

  if (!confirm) {
    console.log("Dry run only. Re-run with --confirm to apply.");
    return;
  }

  target.email = newEmail;
  target.password = await bcrypt.hash(newPassword, 10);
  target.tokenVersion = (target.tokenVersion || 0) + 1;
  await target.save();
  console.log("Done. Sign in again with the new email and password.");
}

main()
  .catch((error) => {
    console.error("Failed:", error.message);
    process.exitCode = 1;
  })
  .finally(async () => {
    await mongoose.disconnect();
  });
