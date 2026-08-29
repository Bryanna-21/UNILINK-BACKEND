const mongoose = require("mongoose");
const Exam = require("../models/Exam");
const ExamSubmission = require("../models/ExamSubmission");
const ExamResult = require("../models/ExamResult");

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);

// Lists exams available to the current student. "Available" means
// Published or Completed — Upcoming exams aren't shown yet, since a
// student can't take or usefully see one before it's published.
// courseId filtering isn't applied here since Exams.js has no course
// context in its current design (it's a flat "all my exams" list).
exports.getStudentExams = async (req, res) => {
  try {
    const exams = await Exam.find({
      status: { $in: ["Published", "Completed"] },
    })
      .select("-questions.correctAnswer")
      .sort({ createdAt: -1 });
    res.status(200).json({ status: "success", count: exams.length, data: exams });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching exams: " + error.message });
  }
};

// Gets a single exam to take. correctAnswer is stripped from every
// question — a student taking the exam should never receive the
// answer key in the response payload, even though it's not rendered
// in the UI today; that's not a safe boundary to rely on.
exports.getExamById = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ status: "error", message: "Invalid exam id" });
    }
    const exam = await Exam.findById(req.params.id).select("-questions.correctAnswer");
    if (!exam) {
      return res.status(404).json({ status: "error", message: "Exam not found" });
    }

    const alreadySubmitted = await ExamSubmission.findOne({
      examId: req.params.id,
      studentId: req.user.id,
    });
    if (alreadySubmitted) {
      return res.status(403).json({
        status: "error",
        message: "You have already submitted this exam.",
      });
    }

    res.status(200).json({ status: "success", data: exam });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching exam: " + error.message });
  }
};

// Records a submission and creates a matching Pending result. Score
// is intentionally left null and status Pending — auto-grading was
// deliberately not built for this pass, since silently scoring
// essay/short answers as 0 would misrepresent a student's actual
// performance. Grading is lecturer-side work for a later session.
exports.submitExam = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ status: "error", message: "Invalid exam id" });
    }
    const exam = await Exam.findById(req.params.id);
    if (!exam) {
      return res.status(404).json({ status: "error", message: "Exam not found" });
    }

    const { answers } = req.body;
    if (!Array.isArray(answers)) {
      return res.status(400).json({ status: "error", message: "answers must be an array" });
    }

    const existing = await ExamSubmission.findOne({
      examId: req.params.id,
      studentId: req.user.id,
    });
    if (existing) {
      return res.status(409).json({ status: "error", message: "You have already submitted this exam." });
    }

    const submission = await ExamSubmission.create({
      examId: req.params.id,
      studentId: req.user.id,
      answers,
    });

    const totalMarks = exam.questions.reduce((sum, q) => sum + (q.marks || 0), 0);

    await ExamResult.create({
      examId: req.params.id,
      studentId: req.user.id,
      submissionId: submission._id,
      totalMarks,
      status: "Pending",
    });

    res.status(201).json({ status: "success", data: submission });
  } catch (error) {
    if (error.code === 11000) {
      return res.status(409).json({ status: "error", message: "You have already submitted this exam." });
    }
    res.status(500).json({ status: "error", message: "Error submitting exam: " + error.message });
  }
};

// Lists the current student's own results, joined with each exam's
// title (Result doesn't store the title directly, only examId — the
// frontend's ExamResult component expects examTitle on the object).
exports.getStudentResults = async (req, res) => {
  try {
    const results = await ExamResult.find({ studentId: req.user.id }).sort({ createdAt: -1 });

    const examIds = [...new Set(results.map((r) => r.examId))];
    const exams = await Exam.find({ _id: { $in: examIds } }).select("title");
    const titleById = Object.fromEntries(exams.map((e) => [e._id.toString(), e.title]));

    const resultsWithTitles = results.map((r) => ({
      ...r.toObject(),
      examTitle: titleById[r.examId] || "Untitled Exam",
    }));

    res.status(200).json({ status: "success", count: resultsWithTitles.length, data: resultsWithTitles });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching results: " + error.message });
  }
};
