const Portfolio = require("../models/Portfolio");
const Achievement = require("../models/Achievement");
const { uploadBufferToCloudinary } = require("../config/cloudinary");

exports.getMyPortfolio = async (req, res) => {
  try {
    let portfolio = await Portfolio.findOne({ userId: req.user.id });
    if (!portfolio) {
      // Auto-create an empty portfolio on first fetch rather than
      // returning 404 — a new user genuinely just hasn't filled
      // anything in yet, this isn't an error state.
      portfolio = await Portfolio.create({ userId: req.user.id });
    }
    res.status(200).json({ status: "success", data: portfolio });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching portfolio: " + error.message });
  }
};

exports.updateMyPortfolio = async (req, res) => {
  try {
    const { skills, languages, projects, volunteerHours } = req.body;
    const update = { updatedAt: new Date() };
    if (skills !== undefined) update.skills = skills;
    if (languages !== undefined) update.languages = languages;
    if (projects !== undefined) update.projects = projects;
    if (volunteerHours !== undefined) update.volunteerHours = volunteerHours;

    const portfolio = await Portfolio.findOneAndUpdate(
      { userId: req.user.id },
      { $set: update },
      { new: true, upsert: true }
    );
    res.status(200).json({ status: "success", data: portfolio });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error updating portfolio: " + error.message });
  }
};

exports.uploadResume = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ status: "error", message: "No file provided" });
    }
    const result = await uploadBufferToCloudinary(req.file.buffer, "unilink/resumes", "raw");
    const portfolio = await Portfolio.findOneAndUpdate(
      { userId: req.user.id },
      { $set: { resumeUrl: result.secure_url, updatedAt: new Date() } },
      { new: true, upsert: true }
    );
    res.status(200).json({ status: "success", data: portfolio });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error uploading resume: " + error.message });
  }
};

exports.addCertificate = async (req, res) => {
  try {
    const { title, issuer } = req.body;
    if (!title) {
      return res.status(400).json({ status: "error", message: "title is required" });
    }
    let fileUrl;
    if (req.file) {
      const result = await uploadBufferToCloudinary(req.file.buffer, "unilink/certificates", "raw");
      fileUrl = result.secure_url;
    }
    const portfolio = await Portfolio.findOneAndUpdate(
      { userId: req.user.id },
      { $push: { certificates: { title, issuer, fileUrl, issuedAt: new Date() } } },
      { new: true, upsert: true }
    );
    res.status(200).json({ status: "success", data: portfolio });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error adding certificate: " + error.message });
  }
};

exports.getAchievementsForUser = async (req, res) => {
  try {
    const userId = req.params.userId || req.user.id;
    const achievements = await Achievement.find({ userId }).sort({ awardedAt: -1 });
    res.status(200).json({ status: "success", count: achievements.length, data: achievements });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching achievements: " + error.message });
  }
};
