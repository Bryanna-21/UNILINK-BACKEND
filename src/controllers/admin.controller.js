const User = require("../models/User");
const Unit = require("../models/Unit");
const University = require("../models/University");
const AuditLog = require("../models/AuditLog");
const Notification = require("../models/Notification");
const Faculty = require("../models/Faculty");
const Department = require("../models/Department");
const Campus = require("../models/Campus");
const Announcement = require("../models/Announcement");

// Search text from the query string goes into a regex: escape it so "(" or ".*" is
// treated literally (prevents 500s and regex-denial-of-service).
const escapeRegex = (s) => String(s).replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// ============================================================
// ADMIN NOTIFICATIONS
// ============================================================
// Read side for the Notification model / notifyAdmins.middleware.js.
// The write side (creating these rows, one per admin, plus a live
// socket push) was already fully built — see notifyAdmins.middleware.js,
// called today only from emergency.controller.js on new reports. This
// REST route was the missing piece: notificationService.js on the
// frontend already called it, but nothing on the backend answered.

exports.getAdminNotifications = async (req, res) => {
  try {
    const notifications = await Notification.find({ recipientId: req.user.id })
      .sort({ createdAt: -1 })
      .limit(50);

    const unreadCount = await Notification.countDocuments({
      recipientId: req.user.id,
      read: false,
    });

    res.json({
      status: "success",
      data: notifications.map((n) => ({
        id: n._id,
        type: n.type,
        title: n.title,
        message: n.message,
        link: n.link,
        read: n.read,
        createdAt: n.createdAt,
      })),
      unreadCount,
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.markAdminNotificationRead = async (req, res) => {
  try {
    const { id } = req.params;

    const notification = await Notification.findOne({
      _id: id,
      recipientId: req.user.id,
    });

    if (!notification) {
      return res.status(404).json({ message: "Notification not found" });
    }

    notification.read = true;
    await notification.save();

    res.json({
      status: "success",
      data: {
        id: notification._id,
        read: notification.read,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// USER MANAGEMENT (all roles — students, lecturers, admins)
// ============================================================
// Distinct from listAdmins below: that one is hardcoded to
// role: "admin" for the superadmin-only admin-management screen.
// This is the general directory Admin/Users.js on the web actually
// wants — every user regardless of role — which had no matching
// route at all (the page ran entirely on hardcoded demo data, per
// its own comment: "Replace later with: adminService.getUsers()").
// Gated requireAdminOrSuperadmin, not requireSuperadmin, since
// browsing the user directory is ordinary admin work, not a
// superadmin-only action like creating other admins.

exports.listUsers = async (req, res) => {
  try {
    const { search, role, page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));

    const query = {};
    if (search) {
      query.$or = [
        { name: new RegExp(escapeRegex(search), "i") },
        { email: new RegExp(escapeRegex(search), "i") },
      ];
    }
    if (role) query.role = role;

    const total = await User.countDocuments(query);
    const users = await User.find(query)
      .select("name email role status universityId createdAt")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    // universityId is a plain String on User, so legacy/test rows can hold non-ObjectId
    // text (e.g. the university NAME). Casting those inside $in threw "Cast to ObjectId
    // failed" and blanked the whole user directory. Only look up valid ids; the rest
    // simply show no university. (listStudents already had this guard; listUsers did not.)
    const universityIds = [
      ...new Set(
        users.map((u) => u.universityId).filter((id) => id && mongoose.Types.ObjectId.isValid(id))
      ),
    ];
    const universities = await University.find({ _id: { $in: universityIds } }).select("name");
    const universityById = new Map(universities.map((u) => [u._id.toString(), u.name]));

    res.json({
      status: "success",
      count: users.length,
      total,
      page: pageNum,
      totalPages: Math.ceil(total / limitNum),
      data: users.map((u) => ({
        id: u._id,
        name: u.name,
        email: u.email,
        role: u.role,
        university: universityById.get(u.universityId) || null,
        status: u.status,
        createdAt: u.createdAt,
      })),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// DASHBOARD STATS
// ============================================================
// Admin/Dashboard.js was fully static — three cards with no numbers
// behind any of them at all. Only "Total Users" maps to something
// that actually exists: there is no post-reporting/flagging system
// anywhere in this backend (postService.js on the frontend has a
// matching dead reportPost function calling a route that was never
// built), and no single "Community" model to count — clubs, study
// groups, polls, and announcements are each their own collection
// under community.controller.js with no unifying concept between
// them. Returning null for both rather than inventing a number or
// a definition neither side of the codebase has ever agreed on.
exports.getDashboardStats = async (req, res) => {
  try {
    // Counts by role so admins and the superadmin can see how many students, lecturers and
    // admins there are, not just a single total. Open to admin and superadmin (route guard).
    const [totalUsers, students, lecturers, admins, superadmins] = await Promise.all([
      User.countDocuments({}),
      User.countDocuments({ role: "student" }),
      User.countDocuments({ role: "lecturer" }),
      User.countDocuments({ role: "admin" }),
      User.countDocuments({ role: "superadmin" }),
    ]);
    res.json({
      status: "success",
      data: {
        totalUsers,
        students,
        lecturers,
        admins,
        superadmins,
        totalCommunities: null, // no single "community" concept exists yet to count
        reportedPosts: null, // no post-reporting/flagging system exists yet
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

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
        { name: new RegExp(escapeRegex(search), "i") },
        { email: new RegExp(escapeRegex(search), "i") },
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

    // Verify BEFORE modifying, not after: findByIdAndUpdate used to
    // run first and only check admin.role on the (already-updated)
    // result, meaning a wrong id could silently rename/deactivate a
    // student, lecturer, or superadmin before the role check ever
    // fired. Same fix applied to deleteAdmin below.
    const existing = await User.findById(id);
    if (!existing || existing.role !== "admin") {
      return res.status(404).json({ message: "Admin not found" });
    }

    const admin = await User.findByIdAndUpdate(
      id,
      { name, email, status },
      { new: true }
    ).select("_id name email role status updatedAt");

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

    // Verify BEFORE deleting: findByIdAndDelete used to run first and
    // only check role on the already-deleted document, meaning a
    // wrong id would permanently delete a student, lecturer, or
    // superadmin, then report "Admin not found" as if nothing had
    // happened. The account was gone either way — the error message
    // just lied about it.
    const existing = await User.findById(id);
    if (!existing || existing.role !== "admin") {
      return res.status(404).json({ message: "Admin not found" });
    }

    const admin = await User.findByIdAndDelete(id);

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
    const { code, name, description, credits, universityId, departmentId } = req.body;

    if (!code || !name || !credits) {
      return res.status(400).json({ message: "Code, name, and credits required" });
    }

    const existing = await Unit.findOne({ code });
    if (existing) {
      return res.status(409).json({ message: "Unit code already exists" });
    }

    // Integrity check per spec: a Unit's Department must belong to the
    // same University as the Unit itself. A Unit with no universityId
    // (global) cannot take a departmentId either — a department always
    // belongs to a specific university, so "global unit, specific
    // department" is a contradiction, not a valid combination.
    if (departmentId) {
      const department = await Department.findById(departmentId);
      if (!department) {
        return res.status(400).json({ message: "Department not found" });
      }
      if (!universityId) {
        return res.status(400).json({
          message: "A unit with a departmentId must also specify a universityId matching that department's university",
        });
      }
      if (department.universityId.toString() !== universityId) {
        return res.status(400).json({
          message: "Department does not belong to the specified university",
        });
      }
    }

    const unit = await Unit.create({
      code,
      name,
      description,
      credits,
      universityId: universityId || null,
      departmentId: departmentId || null,
      status: "active",
    });

    if (unit.universityId) {
      await unit.populate("universityId", "name");
    }
    if (unit.departmentId) {
      await unit.populate("departmentId", "name");
    }

    await AuditLog.create({
      adminId: req.user.id,
      adminEmail: req.user.email,
      action: "UNIT_CREATE",
      targetType: "Unit",
      targetId: unit._id.toString(),
      result: "success",
      details: JSON.stringify({ code, name, credits, departmentId }),
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
        departmentId: unit.departmentId?._id,
        department: unit.departmentId?.name,
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
    const { page = 1, limit = 10, search, status, universityId, departmentId } = req.query;

    const query = {};
    if (search) {
      query.$or = [
        { code: new RegExp(escapeRegex(search), "i") },
        { name: new RegExp(escapeRegex(search), "i") },
      ];
    }
    if (status) query.status = status;
    if (universityId) query.universityId = universityId;
    if (departmentId) query.departmentId = departmentId;

    const total = await Unit.countDocuments(query);
    const units = await Unit.find(query)
      .populate("universityId", "name")
      .populate("departmentId", "name")
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
        departmentId: unit.departmentId?._id,
        department: unit.departmentId?.name,
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
    const { code, name, description, credits, status, universityId, departmentId } = req.body;

    // Same integrity rule as createUnit, applied to the post-update
    // values. Falls back to the existing unit's own universityId when
    // the request doesn't touch it, so setting only departmentId on an
    // already-scoped unit is validated against its current university,
    // not treated as if universityId were being cleared.
    if (departmentId) {
      const existingUnit = await Unit.findById(id);
      if (!existingUnit) {
        return res.status(404).json({ message: "Unit not found" });
      }
      const effectiveUniversityId = universityId !== undefined ? universityId : existingUnit.universityId?.toString();

      const department = await Department.findById(departmentId);
      if (!department) {
        return res.status(400).json({ message: "Department not found" });
      }
      if (!effectiveUniversityId) {
        return res.status(400).json({
          message: "A unit with a departmentId must also specify a universityId matching that department's university",
        });
      }
      if (department.universityId.toString() !== effectiveUniversityId) {
        return res.status(400).json({
          message: "Department does not belong to the specified university",
        });
      }
    }

    const updateFields = { code, name, description, credits, status };
    if (universityId !== undefined) updateFields.universityId = universityId || null;
    if (departmentId !== undefined) updateFields.departmentId = departmentId || null;

    const unit = await Unit.findByIdAndUpdate(id, updateFields, { new: true })
      .populate("universityId", "name")
      .populate("departmentId", "name");

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
      details: JSON.stringify({ code, name, credits, status, departmentId }),
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
        departmentId: unit.departmentId?._id,
        department: unit.departmentId?.name,
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
// STUDENT DIRECTORY
// ============================================================
// A role-scoped view of listUsers above, for Admin/Students.js which
// wants student-only records plus student-specific fields (admissionNumber)
// that listUsers' generic .select() doesn't return.

exports.listStudents = async (req, res) => {
  try {
    const { search, page = 1, limit = 50, universityId } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));

    const query = { role: "student" };
    if (search) {
      query.$or = [
        { name: new RegExp(escapeRegex(search), "i") },
        { email: new RegExp(escapeRegex(search), "i") },
        { admissionNumber: new RegExp(escapeRegex(search), "i") },
      ];
    }
    if (universityId) query.universityId = universityId;

    const total = await User.countDocuments(query);
    const students = await User.find(query)
      .select("name email status universityId admissionNumber createdAt")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    const universityIds = [...new Set(students.map((s) => s.universityId).filter(Boolean))];
    const universities = await University.find({ _id: { $in: universityIds } }).select("name");
    const universityById = new Map(universities.map((u) => [u._id.toString(), u.name]));

    res.json({
      status: "success",
      data: students.map((s) => ({
        id: s._id,
        name: s.name,
        email: s.email,
        status: s.status,
        universityId: s.universityId,
        university: universityById.get(s.universityId) || null,
        admissionNumber: s.admissionNumber,
        createdAt: s.createdAt,
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// GET /admin/students/:id - single student detail. Not just listStudents
// filtered client-side: this returns trustedContacts and bio/phone, which
// the list view deliberately omits (no reason to ship every student's
// emergency contacts over the wire for a table row).
exports.getStudent = async (req, res) => {
  try {
    const { id } = req.params;
    const student = await User.findOne({ _id: id, role: "student" }).select(
      "name email status universityId admissionNumber bio phone trustedContacts createdAt"
    );

    if (!student) {
      return res.status(404).json({ message: "Student not found" });
    }

    let universityName = null;
    if (student.universityId) {
      const uni = await University.findById(student.universityId).select("name");
      universityName = uni?.name || null;
    }

    res.json({
      status: "success",
      data: {
        id: student._id,
        name: student.name,
        email: student.email,
        status: student.status,
        universityId: student.universityId,
        university: universityName,
        admissionNumber: student.admissionNumber,
        bio: student.bio,
        phone: student.phone,
        trustedContacts: student.trustedContacts,
        createdAt: student.createdAt,
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// USER STATUS (suspend / activate) - any role except superadmin
// ============================================================
// Deliberately blocks superadmin as a target, same "verify before
// mutating" pattern as updateAdmin/deleteAdmin above: a wrong :id must
// never silently suspend a superadmin account. Blocks self-suspension
// for the same reason a superadmin can't be targeted - an admin
// locking out their own only working account with no one left to undo it.

exports.updateUserStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status } = req.body;

    if (!["active", "suspended"].includes(status)) {
      return res.status(400).json({ message: "Status must be 'active' or 'suspended'" });
    }

    const target = await User.findById(id);
    if (!target) {
      return res.status(404).json({ message: "User not found" });
    }
    if (target.role === "superadmin") {
      return res.status(403).json({ message: "Cannot change status of a superadmin account" });
    }
    if (String(target._id) === String(req.user.id)) {
      return res.status(403).json({ message: "Cannot change your own account status" });
    }

    target.status = status;
    await target.save();

    await AuditLog.create({
      adminId: req.user.id,
      adminEmail: req.user.email,
      action: status === "suspended" ? "USER_SUSPEND" : "USER_ACTIVATE",
      targetType: "User",
      targetId: target._id.toString(),
      result: "success",
      details: JSON.stringify({ email: target.email, role: target.role, status }),
    });

    res.json({
      status: "success",
      message: `User ${status === "suspended" ? "suspended" : "activated"} successfully`,
      data: { id: target._id, status: target.status },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// UNIVERSITY MANAGEMENT
// ============================================================

// GET /admin/universities - list/search. Separate from createUniversity
// below: the frontend has always been able to create a university but
// never list what already exists, meaning /universities' table had no
// way to render anything without this.
exports.listUniversities = async (req, res) => {
  try {
    const { search, status, verified, page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));

    const query = {};
    if (search) {
      query.$or = [
        { name: new RegExp(escapeRegex(search), "i") },
        { email: new RegExp(escapeRegex(search), "i") },
      ];
    }
    if (status) query.status = status;
    if (verified !== undefined) query.verified = verified === "true";

    const total = await University.countDocuments(query);
    const universities = await University.find(query)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    res.json({
      status: "success",
      data: universities.map((u) => ({
        id: u._id,
        name: u.name,
        email: u.email,
        country: u.country,
        domainCode: u.domainCode,
        status: u.status,
        verified: u.verified,
        createdAt: u.createdAt,
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// PATCH /admin/universities/:id/verified
exports.setUniversityVerified = async (req, res) => {
  try {
    const { id } = req.params;
    const { verified } = req.body;

    if (typeof verified !== "boolean") {
      return res.status(400).json({ message: "verified must be true or false" });
    }

    const university = await University.findByIdAndUpdate(
      id,
      { verified },
      { new: true }
    );

    if (!university) {
      return res.status(404).json({ message: "University not found" });
    }

    await AuditLog.create({
      adminId: req.user.id,
      adminEmail: req.user.email,
      action: verified ? "UNIVERSITY_VERIFY" : "UNIVERSITY_UNVERIFY",
      targetType: "University",
      targetId: university._id.toString(),
      result: "success",
      details: JSON.stringify({ name: university.name, verified }),
    });

    res.json({
      status: "success",
      message: `University ${verified ? "verified" : "unverified"} successfully`,
      data: { id: university._id, verified: university.verified },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

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

    // Every university gets exactly one auto-created, always-present
    // university-wide Community — membership for it is computed at
    // query time (user.universityId === this community's
    // universityId), never stored as CommunityMembership rows. This
    // is the ONLY place type: 'university-wide' is ever created;
    // community_v2.controller.js's createCommunity explicitly
    // forbids that type. Non-fatal if this fails — the university
    // itself is still valid without it, logged rather than thrown.
    try {
      const Community = require("../models/Community");
      await Community.create({
        universityId: university._id.toString(),
        name: `${name} Community`,
        type: "university-wide",
        description: `The official campus-wide community for ${name}.`,
        isPublic: true,
        createdBy: null,
      });
    } catch (communityError) {
      console.error("Failed to auto-create university-wide community:", communityError.message);
    }

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

// ============================================================
// ANALYTICS
// ============================================================
// Day-bucketed counts over a rolling window, computed with a Mongo
// aggregation rather than pulling every document into Node and
// grouping there — this scales with your data size instead of your
// server's memory. `days` query param controls the window (default
// 30), capped at 365 to keep the aggregation cheap.

exports.getUserGrowth = async (req, res) => {
  try {
    const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await User.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      status: "success",
      data: rows.map((r) => ({ date: r._id, count: r.count })),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.getUniversityGrowth = async (req, res) => {
  try {
    const days = Math.min(365, Math.max(1, parseInt(req.query.days, 10) || 30));
    const since = new Date(Date.now() - days * 24 * 60 * 60 * 1000);

    const rows = await University.aggregate([
      { $match: { createdAt: { $gte: since } } },
      {
        $group: {
          _id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
          count: { $sum: 1 },
        },
      },
      { $sort: { _id: 1 } },
    ]);

    res.json({
      status: "success",
      data: rows.map((r) => ({ date: r._id, count: r.count })),
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// AUDIT LOGS
// ============================================================
// Read side for AuditLog - written to on every admin action above (and
// from emergency.controller.js via auditLog.helper.js) since this
// backend's very first admin endpoints, but until now nothing ever
// read a row back. Filterable by action/targetType/adminId so this
// doesn't become an unusable wall of text once it has real volume.

exports.listAuditLogs = async (req, res) => {
  try {
    const { action, targetType, adminId, page = 1, limit = 50 } = req.query;
    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));

    const query = {};
    if (action) query.action = action;
    if (targetType) query.targetType = targetType;
    if (adminId) query.adminId = adminId;

    const total = await AuditLog.countDocuments(query);
    const logs = await AuditLog.find(query)
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    res.json({
      status: "success",
      data: logs.map((l) => ({
        id: l._id,
        adminId: l.adminId,
        adminEmail: l.adminEmail,
        action: l.action,
        targetType: l.targetType,
        targetId: l.targetId,
        result: l.result,
        details: l.details,
        createdAt: l.createdAt,
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// SYSTEM HEALTH
// ============================================================
// Distinct from the public, unauthenticated GET /api/health in app.js:
// that one is a bare uptime-check for load balancers / Render. This is
// the authenticated, admin-panel-facing version with more detail.
// Collection counts run in parallel via Promise.all rather than
// sequentially, since none depends on another.

exports.getSystemHealth = async (req, res) => {
  try {
    const mongoose = require("mongoose");
    const dbState = mongoose.connection.readyState; // 1 = connected
    const dbStateNames = { 0: "disconnected", 1: "connected", 2: "connecting", 3: "disconnecting" };

    const [totalUsers, totalUniversities, totalUnits, activeUsers, suspendedUsers] =
      await Promise.all([
        User.countDocuments({}),
        University.countDocuments({}),
        Unit.countDocuments({}),
        User.countDocuments({ status: "active" }),
        User.countDocuments({ status: "suspended" }),
      ]);

    res.json({
      status: "success",
      data: {
        database: {
          connected: dbState === 1,
          state: dbStateNames[dbState] || "unknown",
        },
        uptimeSeconds: Math.floor(process.uptime()),
        counts: {
          totalUsers,
          activeUsers,
          suspendedUsers,
          totalUniversities,
          totalUnits,
        },
        timestamp: new Date().toISOString(),
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// FACULTY MANAGEMENT
// ============================================================
// University -> Faculty -> Department -> Unit. Superadmin-only per
// spec, same authority tier as University/Unit/Admin management above.

exports.createFaculty = async (req, res) => {
  try {
    const { name, code, universityId } = req.body;

    if (!name || !universityId) {
      return res.status(400).json({ message: "Name and universityId required" });
    }

    const university = await University.findById(universityId);
    if (!university) {
      return res.status(400).json({ message: "University not found" });
    }

    const faculty = await Faculty.create({
      name,
      code: code || null,
      universityId,
      status: "active",
    });
    await faculty.populate("universityId", "name");

    await AuditLog.create({
      adminId: req.user.id,
      adminEmail: req.user.email,
      action: "FACULTY_CREATE",
      targetType: "Faculty",
      targetId: faculty._id.toString(),
      result: "success",
      details: JSON.stringify({ name, code, universityId }),
    });

    res.status(201).json({
      status: "success",
      message: "Faculty created successfully",
      data: {
        id: faculty._id,
        name: faculty.name,
        code: faculty.code,
        universityId: faculty.universityId._id,
        university: faculty.universityId.name,
        status: faculty.status,
        createdAt: faculty.createdAt,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "A faculty with this name already exists at this university" });
    }
    res.status(500).json({ message: error.message });
  }
};

exports.listFaculties = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, status, universityId } = req.query;

    const query = {};
    if (search) query.name = new RegExp(escapeRegex(search), "i");
    if (status) query.status = status;
    if (universityId) query.universityId = universityId;

    const total = await Faculty.countDocuments(query);
    const faculties = await Faculty.find(query)
      .populate("universityId", "name")
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    res.json({
      status: "success",
      data: faculties.map((f) => ({
        id: f._id,
        name: f.name,
        code: f.code,
        universityId: f.universityId?._id,
        university: f.universityId?.name,
        status: f.status,
        createdAt: f.createdAt,
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

exports.updateFaculty = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, status } = req.body;

    // universityId is deliberately not editable here - moving a
    // faculty to a different university would orphan every Department
    // underneath it (each Department's own universityId would no
    // longer match its parent Faculty's). Delete and recreate instead
    // if a faculty was genuinely assigned to the wrong university.
    const faculty = await Faculty.findByIdAndUpdate(
      id,
      { name, code, status },
      { new: true }
    ).populate("universityId", "name");

    if (!faculty) {
      return res.status(404).json({ message: "Faculty not found" });
    }

    await AuditLog.create({
      adminId: req.user.id,
      adminEmail: req.user.email,
      action: "FACULTY_UPDATE",
      targetType: "Faculty",
      targetId: faculty._id.toString(),
      result: "success",
      details: JSON.stringify({ name, code, status }),
    });

    res.json({
      status: "success",
      message: "Faculty updated successfully",
      data: {
        id: faculty._id,
        name: faculty.name,
        code: faculty.code,
        universityId: faculty.universityId?._id,
        university: faculty.universityId?.name,
        status: faculty.status,
        updatedAt: faculty.updatedAt,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "A faculty with this name already exists at this university" });
    }
    res.status(500).json({ message: error.message });
  }
};

exports.deleteFaculty = async (req, res) => {
  try {
    const { id } = req.params;

    // Block deletion while Departments still reference this faculty,
    // rather than deleting it out from under them and leaving orphaned
    // Department documents with a dangling facultyId. Caller must
    // delete/reassign those departments first.
    const dependentCount = await Department.countDocuments({ facultyId: id });
    if (dependentCount > 0) {
      return res.status(409).json({
        message: `Cannot delete: ${dependentCount} department(s) still belong to this faculty`,
      });
    }

    const faculty = await Faculty.findByIdAndDelete(id);
    if (!faculty) {
      return res.status(404).json({ message: "Faculty not found" });
    }

    await AuditLog.create({
      adminId: req.user.id,
      adminEmail: req.user.email,
      action: "FACULTY_DELETE",
      targetType: "Faculty",
      targetId: faculty._id.toString(),
      result: "success",
      details: JSON.stringify({ name: faculty.name }),
    });

    res.json({
      status: "success",
      message: "Faculty deleted successfully",
      data: { id: faculty._id, status: "deleted" },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

// ============================================================
// DEPARTMENT MANAGEMENT
// ============================================================
// universityId is derived from facultyId, never trusted from client
// input - see the comment on Department.js's universityId field.
// Integrity per spec: a Department always belongs to the University
// its chosen Faculty belongs to; there is no independent
// universityId input to this endpoint at all.

exports.createDepartment = async (req, res) => {
  try {
    const { name, code, facultyId } = req.body;

    if (!name || !facultyId) {
      return res.status(400).json({ message: "Name and facultyId required" });
    }

    const faculty = await Faculty.findById(facultyId);
    if (!faculty) {
      return res.status(400).json({ message: "Faculty not found" });
    }

    const department = await Department.create({
      name,
      code: code || null,
      facultyId,
      universityId: faculty.universityId,
      status: "active",
    });
    await department.populate("facultyId", "name");
    await department.populate("universityId", "name");

    await AuditLog.create({
      adminId: req.user.id,
      adminEmail: req.user.email,
      action: "DEPARTMENT_CREATE",
      targetType: "Department",
      targetId: department._id.toString(),
      result: "success",
      details: JSON.stringify({ name, code, facultyId }),
    });

    res.status(201).json({
      status: "success",
      message: "Department created successfully",
      data: {
        id: department._id,
        name: department.name,
        code: department.code,
        facultyId: department.facultyId._id,
        faculty: department.facultyId.name,
        universityId: department.universityId._id,
        university: department.universityId.name,
        status: department.status,
        createdAt: department.createdAt,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "A department with this name already exists under this faculty" });
    }
    res.status(500).json({ message: error.message });
  }
};

exports.listDepartments = async (req, res) => {
  try {
    const { page = 1, limit = 10, search, status, facultyId, universityId } = req.query;

    const query = {};
    if (search) query.name = new RegExp(escapeRegex(search), "i");
    if (status) query.status = status;
    if (facultyId) query.facultyId = facultyId;
    if (universityId) query.universityId = universityId;

    const total = await Department.countDocuments(query);
    const departments = await Department.find(query)
      .populate("facultyId", "name")
      .populate("universityId", "name")
      .skip((page - 1) * limit)
      .limit(parseInt(limit))
      .sort({ createdAt: -1 });

    res.json({
      status: "success",
      data: departments.map((d) => ({
        id: d._id,
        name: d.name,
        code: d.code,
        facultyId: d.facultyId?._id,
        faculty: d.facultyId?.name,
        universityId: d.universityId?._id,
        university: d.universityId?.name,
        status: d.status,
        createdAt: d.createdAt,
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

exports.updateDepartment = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, status, facultyId } = req.body;

    const updateFields = { name, code, status };

    // Moving a department to a different faculty is allowed (unlike
    // Faculty's own universityId, above), but universityId must be
    // re-derived from the new faculty - never accepted directly from
    // the client - so the two can't be set to point at different
    // universities by mistake.
    if (facultyId) {
      const faculty = await Faculty.findById(facultyId);
      if (!faculty) {
        return res.status(400).json({ message: "Faculty not found" });
      }
      updateFields.facultyId = facultyId;
      updateFields.universityId = faculty.universityId;
    }

    const department = await Department.findByIdAndUpdate(id, updateFields, { new: true })
      .populate("facultyId", "name")
      .populate("universityId", "name");

    if (!department) {
      return res.status(404).json({ message: "Department not found" });
    }

    await AuditLog.create({
      adminId: req.user.id,
      adminEmail: req.user.email,
      action: "DEPARTMENT_UPDATE",
      targetType: "Department",
      targetId: department._id.toString(),
      result: "success",
      details: JSON.stringify({ name, code, status, facultyId }),
    });

    res.json({
      status: "success",
      message: "Department updated successfully",
      data: {
        id: department._id,
        name: department.name,
        code: department.code,
        facultyId: department.facultyId?._id,
        faculty: department.facultyId?.name,
        universityId: department.universityId?._id,
        university: department.universityId?.name,
        status: department.status,
        updatedAt: department.updatedAt,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ message: "A department with this name already exists under this faculty" });
    }
    res.status(500).json({ message: error.message });
  }
};

exports.deleteDepartment = async (req, res) => {
  try {
    const { id } = req.params;

    // Same dependent-check pattern as deleteFaculty: block deletion
    // while Units still reference this department, rather than
    // orphaning them.
    const dependentCount = await Unit.countDocuments({ departmentId: id });
    if (dependentCount > 0) {
      return res.status(409).json({
        message: `Cannot delete: ${dependentCount} unit(s) still belong to this department`,
      });
    }

    const department = await Department.findByIdAndDelete(id);
    if (!department) {
      return res.status(404).json({ message: "Department not found" });
    }

    await AuditLog.create({
      adminId: req.user.id,
      adminEmail: req.user.email,
      action: "DEPARTMENT_DELETE",
      targetType: "Department",
      targetId: department._id.toString(),
      result: "success",
      details: JSON.stringify({ name: department.name }),
    });

    res.json({
      status: "success",
      message: "Department deleted successfully",
      data: { id: department._id, status: "deleted" },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};


// ============================================================
// CAMPUS MANAGEMENT
// ============================================================

exports.createCampus = async (req, res) => {
  try {
    const { name, code, universityId } = req.body;

    if (!name || !universityId) {
      return res.status(400).json({
        message: "Name and universityId required",
      });
    }

    const university = await University.findById(universityId);

    if (!university) {
      return res.status(400).json({
        message: "University not found",
      });
    }

    const campus = await Campus.create({
      name,
      code: code || null,
      universityId,
      status: "active",
    });

    await campus.populate("universityId", "name");

    await AuditLog.create({
      adminId: req.user.id,
      adminEmail: req.user.email,
      action: "CAMPUS_CREATE",
      targetType: "Campus",
      targetId: campus._id.toString(),
      result: "success",
      details: JSON.stringify({ name, code, universityId }),
    });

    res.status(201).json({
      status: "success",
      message: "Campus created successfully",
      data: {
        id: campus._id,
        name: campus.name,
        code: campus.code,
        universityId: campus.universityId._id,
        university: campus.universityId.name,
        status: campus.status,
        createdAt: campus.createdAt,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "A campus with this name already exists at this university",
      });
    }

    res.status(500).json({ message: error.message });
  }
};

exports.listCampuses = async (req, res) => {
  try {
    const {
      page = 1,
      limit = 50,
      search,
      status,
      universityId,
    } = req.query;

    const pageNum = Math.max(1, parseInt(page, 10) || 1);
    const limitNum = Math.min(
      100,
      Math.max(1, parseInt(limit, 10) || 50)
    );

    const query = {};

    if (search) {
      query.name = new RegExp(escapeRegex(search), "i");
    }

    if (status) query.status = status;
    if (universityId) query.universityId = universityId;

    const total = await Campus.countDocuments(query);

    const campuses = await Campus.find(query)
      .populate("universityId", "name")
      .sort({ createdAt: -1 })
      .skip((pageNum - 1) * limitNum)
      .limit(limitNum);

    res.json({
      status: "success",
      data: campuses.map((campus) => ({
        id: campus._id,
        name: campus.name,
        code: campus.code,
        universityId: campus.universityId?._id,
        university: campus.universityId?.name,
        status: campus.status,
        createdAt: campus.createdAt,
      })),
      pagination: {
        page: pageNum,
        limit: limitNum,
        total,
        totalPages: Math.ceil(total / limitNum),
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};

exports.updateCampus = async (req, res) => {
  try {
    const { id } = req.params;
    const { name, code, status, universityId } = req.body;

    const campus = await Campus.findById(id);

    if (!campus) {
      return res.status(404).json({
        message: "Campus not found",
      });
    }

    const nextUniversityId = universityId || campus.universityId;

    const university = await University.findById(nextUniversityId);

    if (!university) {
      return res.status(400).json({
        message: "University not found",
      });
    }

    campus.name = name ?? campus.name;
    campus.code = code !== undefined ? (code || null) : campus.code;
    campus.status = status ?? campus.status;
    campus.universityId = nextUniversityId;

    await campus.save();
    await campus.populate("universityId", "name");

    await AuditLog.create({
      adminId: req.user.id,
      adminEmail: req.user.email,
      action: "CAMPUS_UPDATE",
      targetType: "Campus",
      targetId: campus._id.toString(),
      result: "success",
      details: JSON.stringify({
        name: campus.name,
        code: campus.code,
        universityId: campus.universityId._id,
        status: campus.status,
      }),
    });

    res.json({
      status: "success",
      message: "Campus updated successfully",
      data: {
        id: campus._id,
        name: campus.name,
        code: campus.code,
        universityId: campus.universityId._id,
        university: campus.universityId.name,
        status: campus.status,
        updatedAt: campus.updatedAt,
      },
    });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({
        message: "A campus with this name already exists at this university",
      });
    }

    res.status(500).json({ message: error.message });
  }
};

exports.deleteCampus = async (req, res) => {
  try {
    const { id } = req.params;

    const userCount = await User.countDocuments({
      campusId: id,
    });

    if (userCount > 0) {
      return res.status(409).json({
        message: `Cannot delete: ${userCount} user(s) still belong to this campus`,
      });
    }

    const announcementCount = await Announcement.countDocuments({
      campusId: id,
    });

    if (announcementCount > 0) {
      return res.status(409).json({
        message: `Cannot delete: ${announcementCount} announcement(s) still target this campus`,
      });
    }

    const campus = await Campus.findByIdAndDelete(id);

    if (!campus) {
      return res.status(404).json({
        message: "Campus not found",
      });
    }

    await AuditLog.create({
      adminId: req.user.id,
      adminEmail: req.user.email,
      action: "CAMPUS_DELETE",
      targetType: "Campus",
      targetId: campus._id.toString(),
      result: "success",
      details: JSON.stringify({
        name: campus.name,
        universityId: campus.universityId,
      }),
    });

    res.json({
      status: "success",
      message: "Campus deleted successfully",
      data: {
        id: campus._id,
        status: "deleted",
      },
    });
  } catch (error) {
    res.status(500).json({ message: error.message });
  }
};
