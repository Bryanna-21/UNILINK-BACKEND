"use strict";

const { countryKey, validateNumbers, DEFAULTS } = require("../utils/emergencyNumbers.rules");

// GET  /api/emergency/numbers        the numbers for the caller's own country (any signed-in person)
// GET  /api/emergency/numbers/all    every country that has been set up (superadmin)
// PUT  /api/emergency/numbers        add or replace one country's numbers (superadmin)
function createEmergencyNumbersController({ User, EmergencyNumber, service, AuditLog, log = console }) {
  return {
    async getMyNumbers(req, res) {
      try {
        const me = await User.findById(req.user.id).select("universityId");
        const data = await service.forUniversity(me && me.universityId);
        return res.status(200).json({ status: "success", data });
      } catch (error) {
        log.error("✗ Emergency numbers lookup failed:", error && error.message);
        return res.status(500).json({ status: "error", message: "Could not load the emergency numbers." });
      }
    },

    async listAll(req, res) {
      try {
        if (req.user.role !== "superadmin") {
          return res.status(403).json({ status: "error", message: "Forbidden - superadmin access required" });
        }
        const saved = await EmergencyNumber.find({}).sort({ country: 1 }).lean();
        const savedKeys = new Set(saved.map((r) => r.countryKey));
        const data = [
          ...saved.map((r) => ({ country: r.country, numbers: r.numbers, source: "database", updatedAt: r.updatedAt })),
          ...Object.entries(DEFAULTS)
            .filter(([key]) => !savedKeys.has(key))
            .map(([, d]) => ({ country: d.country, numbers: d.numbers, source: "default" })),
        ];
        return res.status(200).json({ status: "success", data });
      } catch (error) {
        log.error("✗ Emergency numbers list failed:", error && error.message);
        return res.status(500).json({ status: "error", message: "Could not load the emergency numbers." });
      }
    },

    async setNumbers(req, res) {
      try {
        if (req.user.role !== "superadmin") {
          return res.status(403).json({ status: "error", message: "Forbidden - superadmin access required" });
        }
        const country = typeof req.body?.country === "string" ? req.body.country.trim().replace(/\s+/g, " ") : "";
        const key = countryKey(country);
        if (!key) {
          return res.status(400).json({ status: "error", message: "Give the country's name." });
        }
        const checked = validateNumbers(req.body?.numbers);
        if (!checked.ok) {
          return res.status(400).json({ status: "error", message: checked.message });
        }

        const saved = await EmergencyNumber.findOneAndUpdate(
          { countryKey: key },
          { $set: { country, numbers: checked.numbers, updatedBy: String(req.user.id), updatedAt: new Date() } },
          { upsert: true, new: true, setDefaultsOnInsert: true }
        ).lean();

        try {
          await AuditLog.create({
            adminId: String(req.user.id),
            adminEmail: req.user.email || "unknown",
            action: "EMERGENCY_NUMBERS_SET",
            targetType: "EmergencyNumber",
            targetId: key,
            result: "success",
            details: JSON.stringify({ country, numbers: checked.numbers }),
          });
        } catch (error) {
          log.error("✗ Emergency numbers audit entry failed:", error && error.message);
        }

        return res.status(200).json({
          status: "success",
          data: { country: saved.country, numbers: saved.numbers, source: "database" },
        });
      } catch (error) {
        log.error("✗ Emergency numbers save failed:", error && error.message);
        return res.status(500).json({ status: "error", message: "Could not save the emergency numbers." });
      }
    },
  };
}

let instance = null;
function real() {
  if (!instance) {
    instance = createEmergencyNumbersController({
      User: require("../models/User"),
      EmergencyNumber: require("../models/EmergencyNumber"),
      AuditLog: require("../models/AuditLog"),
      service: require("../services/emergencyNumbers.service"),
    });
  }
  return instance;
}

module.exports = {
  createEmergencyNumbersController,
  getMyNumbers: (req, res) => real().getMyNumbers(req, res),
  listAll: (req, res) => real().listAll(req, res),
  setNumbers: (req, res) => real().setNumbers(req, res),
};
