const mongoose = require("mongoose");

const userSchema = new mongoose.Schema({
  name: String,
  email: { type: String, unique: true },
  password: String,
  universityId: String,
  role: { type: String, default: "student" },
  status: { type: String, enum: ["active", "suspended"], default: "active" },
  createdAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("User", userSchema);
