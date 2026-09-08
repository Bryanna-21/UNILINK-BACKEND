const User = require("../models/User");
const Unit = require("../models/Unit");
const University = require("../models/University");
const AuditLog = require("../models/AuditLog");

// ============================================================
// ADMIN MANAGEMENT (Users with role="admin")
// ============================================================

exports.createAdmin = async (req, res) => {
  try {
    const { name, email, password } = req.body;

    if (!name || !email || !password) {
      return res.status(400).json({ message: "Name, email, and password required" });
    }

    const existing = await User.findOne({ email });
    if (existing) {
      return res.status(409).json({ message: "User with this email already exists" });
    }

    const bcrypt = require("bcryptjs");
    const hashedPassword = await bcrypt.hash(password, 10);

    const admin = await User.create({
      name,
      email,
      password: hashedPassword,
      role: "admin",
      status: "active",
      isVerified: true,
    });

    await AuditLog.create({
      adminId: req.user.id,
      adminEmail: req.user.email,
      action: "ADMIN_CREATE",
      targetType: "Admin",
      targetId: admin._id.toString(),
      result: "success",
      details: JSON.stringify({ name, email }),
    });

    res.status(201).json({
      status: "success",
      message: "Administrator created successfully",
      data: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        status: admin.status,
        createdAt: admin.createdAt,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.listAdmins = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, status } = req.query;

    const query = { role: "admin" };
    
    if (search) {
      query.$or = [
        { name: new RegExp(search, "i") },
        { email: new RegExp(search, "i") },
      ];
    }
    if (status) query.status = status;

    const total = await User.countDocuments(query);
    const admins = await User.find(query)
      .select("_id name email role status createdAt")
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    res.json({
      status: "success",
      data: admins.map((admin) => ({
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
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

exports.updateAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, email, status } = req.body;

    const admin = await User.findByIdAndUpdate(
      id,
      { name, email, status },
      { new: true }
    ).select("_id name email role status updatedAt");

    if (!admin || admin.role !== "admin") {
      return res.status(404).json({ message: "Admin not found" });
    }

    await AuditLog.create({
      adminId: req.user.id,
      adminEmail: req.user.email,
      action: "ADMIN_UPDATE",
      targetType: "Admin",
      targetId: admin._id.toString(),
      result: "success",
      details: JSON.stringify({ name, email, status }),
    });

    res.json({
      status: "success",
      message: "Administrator updated successfully",
      data: {
        id: admin._id,
        name: admin.name,
        email: admin.email,
        role: admin.role,
        status: admin.status,
        updatedAt: admin.updatedAt,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.deleteAdmin = async (req, res) => {
  try {
    const { id } = req.params;

    const admin = await User.findByIdAndDelete(id);

    if (!admin || admin.role !== "admin") {
      return res.status(404).json({ message: "Admin not found" });
    }

    await AuditLog.create({
      adminId: req.user.id,
      adminEmail: req.user.email,
      action: "ADMIN_DELETE",
      targetType: "Admin",
      targetId: admin._id.toString(),
      result: "success",
      details: JSON.stringify({ name: admin.name, email: admin.email }),
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

exports.createUnit = async (req, res) => {
  try {
    const { code, name, description, credits, universityId } = req.body;

    if (!code || !name || !credits) {
      return res.status(400).json({ message: "Code, name, and credits required" });
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
      adminId: req.user.id,
      adminEmail: req.user.email,
      action: "UNIT_CREATE",
      targetType: "Unit",
      targetId: unit._id.toString(),
      result: "success",
      details: JSON.stringify({ code, name, credits }),
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
      adminId: req.user.id,
      adminEmail: req.user.email,
      action: "UNIT_UPDATE",
      targetType: "Unit",
      targetId: unit._id.toString(),
      result: "success",
      details: JSON.stringify({ code, name, credits, status }),
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

exports.deleteUnit = async (req, res) => {
  try {
    const { id } = req.params;

    const unit = await Unit.findByIdAndDelete(id);

    if (!unit) {
      return res.status(404).json({ message: "Unit not found" });
    }

    await AuditLog.create({
      adminId: req.user.id,
      adminEmail: req.user.email,
      action: "UNIT_DELETE",
      targetType: "Unit",
      targetId: unit._id.toString(),
      result: "success",
      details: JSON.stringify({ code: unit.code, name: unit.name }),
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
      adminId: req.user.id,
      adminEmail: req.user.email,
      action: "UNIVERSITY_CREATE",
      targetType: "University",
      targetId: university._id.toString(),
      result: "success",
      details: JSON.stringify({ name, email, country }),
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
