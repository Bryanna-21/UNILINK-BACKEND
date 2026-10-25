const legal = require("../services/legal.service");

// Thin HTTP layer: every decision is made in legal.core.js.
const send = (res, result) => {
  if (!result.ok) return res.status(result.status).json({ status: "error", message: result.message, code: result.code });
  return res.status(200).json({ status: "success", data: result.data });
};

exports.getPrivacy = (req, res) => {
  try {
    res.set("Cache-Control", "public, max-age=300");
    return send(res, legal.getPrivacyNotice());
  } catch (error) {
    console.error("Privacy notice error:", error);
    return res.status(500).json({ status: "error", message: "Something went wrong. Please try again." });
  }
};

exports.getStatus = async (req, res) => {
  try {
    return send(res, await legal.status(req.user.id));
  } catch (error) {
    console.error("Legal status error:", error);
    return res.status(500).json({ status: "error", message: "Something went wrong. Please try again." });
  }
};

exports.acknowledge = async (req, res) => {
  try {
    const body = req.body || {};
    return send(res, await legal.acknowledge(req.user.id, { policyType: body.policyType, version: body.version, source: body.source }));
  } catch (error) {
    console.error("Legal acknowledge error:", error);
    return res.status(500).json({ status: "error", message: "Something went wrong. Please try again." });
  }
};
