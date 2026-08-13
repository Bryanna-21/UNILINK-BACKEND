const mongoose = require("mongoose");
const Event = require("../models/Event");
const RSVP = require("../models/RSVP");

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);
const isStaff = (role) => role === "lecturer" || role === "admin";

exports.getEvents = async (req, res) => {
  try {
    const events = await Event.find({}).sort({ date: 1 });
    res.status(200).json({ status: "success", count: events.length, data: events });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching events: " + error.message });
  }
};

exports.getEventById = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ status: "error", message: "Invalid event id" });
    }
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ status: "error", message: "Event not found" });
    }
    res.status(200).json({ status: "success", data: event });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching event: " + error.message });
  }
};

exports.createEvent = async (req, res) => {
  try {
    if (!isStaff(req.user.role)) {
      return res.status(403).json({ status: "error", message: "Only lecturers or admins can create events" });
    }
    const { title, description, date, location, capacity } = req.body;
    if (!title || !date) {
      return res.status(400).json({ status: "error", message: "title and date are required" });
    }
    const event = await Event.create({ title, description, date, location, capacity, createdBy: req.user.id });
    res.status(201).json({ status: "success", data: event });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error creating event: " + error.message });
  }
};

exports.rsvpToEvent = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ status: "error", message: "Invalid event id" });
    }
    const event = await Event.findById(req.params.id);
    if (!event) {
      return res.status(404).json({ status: "error", message: "Event not found" });
    }

    const existing = await RSVP.findOne({ eventId: req.params.id, userId: req.user.id });
    if (existing) {
      return res.status(200).json({ status: "success", data: existing });
    }

    if (event.capacity) {
      const rsvpCount = await RSVP.countDocuments({ eventId: req.params.id });
      if (rsvpCount >= event.capacity) {
        return res.status(400).json({ status: "error", message: "Event is at full capacity" });
      }
    }

    const rsvp = await RSVP.create({ eventId: req.params.id, userId: req.user.id });
    res.status(201).json({ status: "success", data: rsvp });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error creating RSVP: " + error.message });
  }
};

exports.getMyRsvpForEvent = async (req, res) => {
  try {
    const rsvp = await RSVP.findOne({ eventId: req.params.id, userId: req.user.id });
    res.status(200).json({ status: "success", data: rsvp || null });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching RSVP: " + error.message });
  }
};

exports.checkInWithQr = async (req, res) => {
  try {
    if (!isStaff(req.user.role)) {
      return res.status(403).json({ status: "error", message: "Only lecturers or admins can check in attendees" });
    }
    const { qrToken } = req.body;
    if (!qrToken) {
      return res.status(400).json({ status: "error", message: "qrToken is required" });
    }
    const rsvp = await RSVP.findOne({ qrToken });
    if (!rsvp) {
      return res.status(404).json({ status: "error", message: "No RSVP matches this QR code" });
    }
    if (rsvp.checkedIn) {
      return res.status(400).json({ status: "error", message: "This attendee has already checked in" });
    }
    rsvp.checkedIn = true;
    rsvp.checkedInAt = new Date();
    await rsvp.save();
    res.status(200).json({ status: "success", data: rsvp });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error checking in: " + error.message });
  }
};
