const mongoose = require("mongoose");

// One Portfolio document per user, holding all the profile-extension
// fields the spec asked for (skills, certificates, projects,
// volunteer hours, resume) rather than one model per concept — these
// are all "things attached to a user's profile," not independent
// entities with their own lifecycle.
const portfolioSchema = new mongoose.Schema({
  userId: { type: String, required: true, unique: true },
  resumeUrl: String,
  skills: { type: [String], default: [] },
  certificates: [
    {
      title: String,
      issuer: String,
      fileUrl: String,
      issuedAt: Date
    }
  ],
  languages: { type: [String], default: [] },
  projects: [
    {
      title: String,
      description: String,
      link: String
    }
  ],
  volunteerHours: { type: Number, default: 0 },
  updatedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model("Portfolio", portfolioSchema);
