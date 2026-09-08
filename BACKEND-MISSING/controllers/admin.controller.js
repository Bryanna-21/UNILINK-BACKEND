const Admin = require("../models/Admin");
const Unit = require("../models/Unit");
const University = require("../models/university.model");
const AuditLog = require("../models/auditLog.model");

// ============================================================
// ADMIN MANAGEMENT
// ============================================================

// Create Admin
exports.createAdmin = async (req, res) => {
  try {
    const { name, email, universityId } = req.body;

    if (!name || !email) {
      return res.status(400).json({ message: "Name and email required" });
    }

    const existing = await Admin.findOne({ email });
    if (existing) {
      return res
        .status(409)
        .json({ message: "Admin with this email already exists" });
    }

    const admin = await Admin.create({
      name,
      email,
      universityId: universityId || null,
      status: "active",
    });

    if (admin.universityId) {
      await admin.populate("universityId", "name");
    }

    await AuditLog.create({
      action: "ADMIN_CREATE",
      adminId: req.user._id,
      targetId: admin._id,
      targetType: "Admin",
      changes: { name, email, universityId },
    });

    res.status(201).json({
      status: "success",
      message: "Administrator created successfully",
      data: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        universityId: admin.universityId?._id,
        university: admin.universityId?.name,
        status: admin.status,
        createdAt: admin.createdAt,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// List Admins
exports.listAdmins = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, status, universityId } = req.query;

    const query = {};
    if (search) {
      query.$or = [
        { name: new RegExp(search, "i") },
        { email: new RegExp(search, "i") },
      ];
    }
    if (status) query.status = status;
    if (universityId) query.universityId = universityId;

    const total = await Admin.countDocuments(query);
    const admins = await Admin.find(query)
      .populate("universityId", "name")
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    res.json({
      status: "success",
      data: admins.map((admin) => ({
        id: admin._id,
        name: admin.name,
        email: admin.email,
        universityId: admin.universityId?._id,
        university: admin.universityId?.name,
        status: admin.status,
        createdAt: admin.createdAt,
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update Admin
exports.updateAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, universityId, status } = req.body;

    const admin = await Admin.findByIdAndUpdate(
      id,
      { name, email, universityId, status },
      { new: true }
    ).populate("universityId", "name");

    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    await AuditLog.create({
      action: "ADMIN_UPDATE",
      adminId: req.user._id,
      targetId: admin._id,
      targetType: "Admin",
      changes: { name, email, universityId, status },
    });

    res.json({
      status: "success",
      message: "Administrator updated successfully",
      data: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        universityId: admin.universityId?._id,
        university: admin.universityId?.name,
        status: admin.status,
        updatedAt: admin.updatedAt,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete Admin
exports.deleteAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    const admin = await Admin.findByIdAndDelete(id);

    if (!admin) {
      return res.status(404).json({ message: "Admin not found" });
    }

    await AuditLog.create({
      action: "ADMIN_DELETE",
      adminId: req.user._id,
      targetId: admin._id,
      targetType: "Admin",
      changes: { name: admin.name, email: admin.email },
    });

    res.json({
      status: "success",
      message: "Administrator deleted successfully",
      data: {
        id: admin._id,
        name: admin.name,
        status: "deleted",
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// UNIT MANAGEMENT
// ============================================================

// Create Unit
exports.createUnit = async (req, res) => {
  try {
    const { code, name, description, credits, universityId } = req.body;

    if (!code || !name || !credits) {
      return res
        .status(400)
        .json({ message: "Code, name, and credits required" });
    }

    const existing = await Unit.findOne({ code });
    if (existing) {
      return res.status(409).json({ message: "Unit code already exists" });
    }

    const unit = await Unit.create({
      code,
      name,
      description,
      credits,
      universityId: universityId || null,
      status: "active",
    });

    if (unit.universityId) {
      await unit.populate("universityId", "name");
    }

    await AuditLog.create({
      action: "UNIT_CREATE",
      adminId: req.user._id,
      targetId: unit._id,
      targetType: "Unit",
      changes: { code, name, credits },
    });

    res.status(201).json({
      status: "success",
      message: "Unit created successfully",
      data: {
        id: unit._id,
        code: unit.code,
        name: unit.name,
        description: unit.description,
        credits: unit.credits,
        universityId: unit.universityId?._id,
        university: unit.universityId?.name,
        status: unit.status,
        createdAt: unit.createdAt,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// List Units
exports.listUnits = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, status, universityId } = req.query;

    const query = {};
    if (search) {
      query.$or = [
        { code: new RegExp(search, "i") },
        { name: new RegExp(search, "i") },
      ];
    }
    if (status) query.status = status;
    if (universityId) query.universityId = universityId;

    const total = await Unit.countDocuments(query);
    const units = await Unit.find(query)
      .populate("universityId", "name")
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    res.json({
      status: "success",
      data: units.map((unit) => ({
        id: unit._id,
        code: unit.code,
        name: unit.name,
        description: unit.description,
        credits: unit.credits,
        universityId: unit.universityId?._id,
        university: unit.universityId?.name,
        status: unit.status,
        createdAt: unit.createdAt,
      })),
      pagination: {
        page: parseInt(page),
        limit: parseInt(limit),
        total,
        totalPages: Math.ceil(total / limit),
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Update Unit
exports.updateUnit = async (req, res) => {
  try {
    const { id } = req.params;
    const { code, name, description, credits, status } = req.body;

    const unit = await Unit.findByIdAndUpdate(
      id,
      { code, name, description, credits, status },
      { new: true }
    ).populate("universityId", "name");

    if (!unit) {
      return res.status(404).json({ message: "Unit not found" });
    }

    await AuditLog.create({
      action: "UNIT_UPDATE",
      adminId: req.user._id,
      targetId: unit._id,
      targetType: "Unit",
      changes: { code, name, credits, status },
    });

    res.json({
      status: "success",
      message: "Unit updated successfully",
      data: {
        id: unit._id,
        code: unit.code,
        name: unit.name,
        description: unit.description,
        credits: unit.credits,
        universityId: unit.universityId?._id,
        university: unit.universityId?.name,
        status: unit.status,
        updatedAt: unit.updatedAt,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// Delete Unit
exports.deleteUnit = async (req, res) => {
  try {
    const { id } = req.params;

    const unit = await Unit.findByIdAndDelete(id);

    if (!unit) {
      return res.status(404).json({ message: "Unit not found" });
    }

    await AuditLog.create({
      action: "UNIT_DELETE",
      adminId: req.user._id,
      targetId: unit._id,
      targetType: "Unit",
      changes: { code: unit.code, name: unit.name },
    });

    res.json({
      status: "success",
      message: "Unit deleted successfully",
      data: {
        id: unit._id,
        code: unit.code,
        status: "deleted",
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// UNIVERSITY MANAGEMENT
// ============================================================

// Create University (superadmin only)
exports.createUniversity = async (req, res) => {
  try {
    const { name, email, country } = req.body;

    if (!name || !email) {
      return res.status(400).json({ message: "Name and email required" });
    }

    const existing = await University.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: "University already exists" });
    }

    const university = await University.create({
      name,
      email,
      country,
      status: "active",
      verified: false,
    });

    await AuditLog.create({
      action: "UNIVERSITY_CREATE",
      adminId: req.user._id,
      targetId: university._id,
      targetType: "University",
      changes: { name, email, country },
    });

    res.status(201).json({
      status: "success",
      message: "University created successfully",
      data: {
        id: university._id,
        name: university.name,
        email: university.email,
        country: university.country,
        status: university.status,
        verified: university.verified,
        createdAt: university.createdAt,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
