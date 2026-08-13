const EmergencyReport = require("../models/EmergencyReport");
const notifyAdmins = require("../middleware/notifyAdmins.middleware");

const VALID_TYPES = ["medical", "safety", "abuse"];

exports.reportEmergency = async (req, res) => {
  try {
    const { type, message, location } = req.body;

    if (!type || !VALID_TYPES.includes(type)) {
      return res.status(400).json({
        status: "error",
        message: `type must be one of: ${VALID_TYPES.join(", ")}`,
      });
    }

    const report = await EmergencyReport.create({
      userId: req.user.id,
      type,
      message,
      location,
    });

    // Fire-and-forget: the reporting user's request succeeds regardless
    // of whether admin notification succeeds (see notifyAdmins.middleware.js).
    notifyAdmins({
      type: "new_emergency_report",
      title: `New ${type} report`,
      message: message ? message.slice(0, 140) : "No additional details provided.",
      link: "/reports",
    });

    res.status(201).json({ status: "success", data: report });
  } catch (error) {
    res.status(500).json({
      status: "error",
      message: "Failed to report emergency: " + error.message,
    });
  }
};

exports.getContacts = async (req, res) => {
  res.status(200).json({
    status: "success",
    data: [
      { name: "National Emergency", phone: "112" },
      { name: "Ambulance", phone: "999" },
      { name: "Campus Security", phone: "0700000000" },
    ],
  });
};

exports.requestHelp = async (req, res) => {
  res.status(200).json({
    status: "success",
    message: "Help request received. Support will reach out.",
  });
};
