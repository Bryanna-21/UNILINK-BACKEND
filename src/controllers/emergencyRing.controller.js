"use strict";

// Two endpoints for the emergency ring:
//   GET /api/emergency/contacts       the emergency numbers for the caller's country
//   GET /api/emergency/alerts/active  recent SOS alerts nobody has acknowledged yet (admins only)
//
// Dependencies are injected so the exact handlers are tested without a database
// (tests/emergencyRing.controller.test.js); the bottom of the file wires the real models.

const { scopeFilter } = require("../utils/adminScope");

// An SOS keeps ringing on admin screens only while it is recent. A report that was forgotten
// for hours must not ring forever.
const ACTIVE_WINDOW_MS = 6 * 60 * 60 * 1000;

function createEmergencyRing({ User, University, EmergencyReport, numbersFor, isValidId, now = () => Date.now() }) {
  async function numbersForUser(userId) {
    let country;
    try {
      const me = await User.findById(userId).select("universityId").lean();
      if (me?.universityId && isValidId(me.universityId)) {
        const uni = await University.findById(me.universityId).select("country").lean();
        country = uni?.country;
      }
    } catch (error) {
      // An emergency screen must still get numbers when a lookup fails.
      console.error("[emergency] country lookup failed:", error.message);
    }
    return numbersFor(country);
  }

  async function getContacts(req, res) {
    const result = await numbersForUser(req.user.id);
    res.status(200).json({ status: "success", country: result.country, known: result.known, data: result.numbers });
  }

  async function getActiveAlerts(req, res) {
    try {
      const actor = await User.findById(req.user.id).select("role universityId status").lean();
      if (!actor || !["admin", "superadmin"].includes(actor.role) || actor.status !== "active") {
        return res.status(403).json({ status: "error", message: "Admins only." });
      }

      const scope = scopeFilter({ role: actor.role, universityId: actor.universityId || null });
      const since = new Date(now() - ACTIVE_WINDOW_MS);
      const reports = await EmergencyReport.find({ type: "sos", status: "OPEN", createdAt: { $gte: since }, ...scope })
        .sort({ createdAt: -1 })
        .limit(20)
        .lean();

      const ids = [...new Set(reports.map((r) => String(r.userId)))];
      const people = ids.length ? await User.find({ _id: { $in: ids } }).select("name phone").lean() : [];
      const byId = new Map(people.map((p) => [String(p._id), p]));
      const numbers = (await numbersForUser(req.user.id)).numbers;

      res.status(200).json({
        status: "success",
        count: reports.length,
        numbers,
        data: reports.map((r) => ({
          _id: String(r._id),
          studentName: byId.get(String(r.userId))?.name || "A student",
          studentPhone: byId.get(String(r.userId))?.phone || "",
          location: r.location || "",
          coordinates: r.coordinates || null,
          createdAt: r.createdAt,
        })),
      });
    } catch (error) {
      console.error("[emergency] active alerts failed:", error.message);
      res.status(500).json({ status: "error", message: "Could not load alerts." });
    }
  }

  return { getContacts, getActiveAlerts, numbersForUser };
}

let instance = null;
function real() {
  if (!instance) {
    const mongoose = require("mongoose");
    instance = createEmergencyRing({
      User: require("../models/User"),
      University: require("../models/University"),
      EmergencyReport: require("../models/EmergencyReport"),
      numbersFor: require("../utils/emergencyNumbers").numbersFor,
      isValidId: (v) => mongoose.isValidObjectId(v),
    });
  }
  return instance;
}

module.exports = {
  createEmergencyRing,
  ACTIVE_WINDOW_MS,
  getContacts: (req, res) => real().getContacts(req, res),
  getActiveAlerts: (req, res) => real().getActiveAlerts(req, res),
};
