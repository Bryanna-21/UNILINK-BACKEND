const Note = require("../models/Note");
const PastPaper = require("../models/PastPaper");
const { uploadBufferToCloudinary } = require("../config/cloudinary");
const isStaff = (role) => role === "lecturer" || role === "admin";

// ---------- Notes ----------

exports.getNotesForCourse = async (req, res) => {
  try {
    const notes = await Note.find({ courseId: req.params.courseId }).sort({ createdAt: -1 });
    res.status(200).json({ status: "success", count: notes.length, data: notes });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching notes: " + error.message });
  }
};

exports.uploadNote = async (req, res) => {
  try {
    if (!isStaff(req.user.role)) {
      return res.status(403).json({ status: "error", message: "Only lecturers or admins can upload notes" });
    }
    if (!req.file) {
      return res.status(400).json({ status: "error", message: "No file provided" });
    }
    const { title, unitId } = req.body;
    if (!title) {
      return res.status(400).json({ status: "error", message: "title is required" });
    }

    // Map the real mimetype to a stored fileType, rather than the
    // previous binary "isImage ? image : pdf" check, which silently
    // mislabeled every non-image upload (including Word documents)
    // as "pdf" even though the actual file on Cloudinary was
    // correct. Cloudinary's resource_type only needs to distinguish
    // image vs raw, so that check is kept separate from fileType.
    const isImage = req.file.mimetype.startsWith("image/");
    const fileTypeByMimetype = {
      "application/pdf": "pdf",
      "application/msword": "doc",
      "application/vnd.openxmlformats-officedocument.wordprocessingml.document": "docx",
    };
    const fileType = isImage ? "image" : (fileTypeByMimetype[req.file.mimetype] || "pdf");

    const result = await uploadBufferToCloudinary(
      req.file.buffer,
      "unilink/notes",
      isImage ? "image" : "raw"
    );
    const note = await Note.create({
      courseId: req.params.courseId,
      unitId,
      title,
      fileUrl: result.secure_url,
      fileType,
      uploadedBy: req.user.id
    });
    res.status(201).json({ status: "success", data: note });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error uploading note: " + error.message });
  }
};

// ---------- Past Papers ----------

exports.getPastPapersForCourse = async (req, res) => {
  try {
    const papers = await PastPaper.find({ courseId: req.params.courseId }).sort({ year: -1 });
    res.status(200).json({ status: "success", count: papers.length, data: papers });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching past papers: " + error.message });
  }
};

exports.uploadPastPaper = async (req, res) => {
  try {
    if (!isStaff(req.user.role)) {
      return res.status(403).json({ status: "error", message: "Only lecturers or admins can upload past papers" });
    }
    if (!req.file) {
      return res.status(400).json({ status: "error", message: "No file provided" });
    }
    const { title, year } = req.body;
    if (!title) {
      return res.status(400).json({ status: "error", message: "title is required" });
    }
    const result = await uploadBufferToCloudinary(req.file.buffer, "unilink/past-papers", "raw");
    const paper = await PastPaper.create({
      courseId: req.params.courseId,
      title,
      year,
      fileUrl: result.secure_url,
      uploadedBy: req.user.id
    });
    res.status(201).json({ status: "success", data: paper });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error uploading past paper: " + error.message });
  }
};
