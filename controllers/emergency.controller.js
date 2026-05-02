const EmergencyReport = require("../models/EmergencyReport");

exports.reportEmergency = async (req, res) => {
  try {
    const { type, message, location } = req.body;

    const report = await EmergencyReport.create({
      userId: req.user.id,
      type,
      message,
      location
    });

    res.json({ success: true, report });
  } catch (err) {
    res.status(500).json({ error: "Failed to report emergency" });
  }
};

exports.getContacts = async (req, res) => {
  res.json([
    { name: "National Emergency", phone: "112" },
    { name: "Ambulance", phone: "999" },
    { name: "Campus Security", phone: "0700000000" }
  ]);
};

exports.requestHelp = async (req, res) => {
  res.json({
    success: true,
    message: "Help request received. Support will reach out."
  });
};
