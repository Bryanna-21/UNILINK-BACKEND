const mongoose = require("mongoose");
const LostItem = require("../models/LostItem");
const { uploadBufferToCloudinary } = require("../config/cloudinary");

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

exports.getLostItems = async (req, res) => {
  try {
    const filter = { resolved: false };
    if (req.query.status) filter.status = req.query.status;
    const items = await LostItem.find(filter).sort({ createdAt: -1 });
    res.status(200).json({ status: "success", count: items.length, data: items });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching lost items: " + error.message });
  }
};

exports.reportItem = async (req, res) => {
  try {
    const { itemName, description, location, status, contactInfo } = req.body;
    if (!itemName || !status) {
      return res.status(400).json({ status: "error", message: "itemName and status are required" });
    }
    if (!["lost", "found"].includes(status)) {
      return res.status(400).json({ status: "error", message: 'status must be "lost" or "found"' });
    }

    let imageUrl;
    if (req.file) {
      const result = await uploadBufferToCloudinary(req.file.buffer, "unilink/lost-and-found", "image");
      imageUrl = result.secure_url;
    }

    const item = await LostItem.create({
      itemName,
      description,
      location,
      status,
      contactInfo,
      imageUrl,
      reportedBy: req.user.id
    });
    res.status(201).json({ status: "success", data: item });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error reporting item: " + error.message });
  }
};

exports.markResolved = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ status: "error", message: "Invalid item id" });
    }
    const item = await LostItem.findById(req.params.id);
    if (!item) {
      return res.status(404).json({ status: "error", message: "Item not found" });
    }
    if (item.reportedBy !== req.user.id) {
      return res.status(403).json({ status: "error", message: "Only the reporter can resolve this item" });
    }
    item.resolved = true;
    await item.save();
    res.status(200).json({ status: "success", data: item });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error resolving item: " + error.message });
  }
};
