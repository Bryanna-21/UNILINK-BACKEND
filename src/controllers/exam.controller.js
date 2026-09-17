const mongoose = require("mongoose");
const Exam = require("../models/Exam");
const ExamSubmission = require("../models/ExamSubmission");
const ExamResult = require("../models/ExamResult");
const Course = require("../models/Course");
const User = require("../models/User");
const notifyUsers = require("../middleware/notifyUsers.middleware");
const { isLecturer } = require("../utils/roles");

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

// Gets a single exam. Lecturers viewing their own exam see the full
// answer key; everyone else (students, or a lecturer viewing someone
// else's exam) gets correctAnswer stripped. Non-owners taking a live
// exam are also blocked if they've already submitted.
exports.getExamById = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ status: "error", message: "Invalid exam id" });
    }

    const rawExam = await Exam.findById(req.params.id);
    if (!rawExam) {
      return res.status(404).json({ status: "error", message: "Exam not found" });
    }

    const isOwner = isLecturer(req.user.role) && rawExam.createdBy === req.user.id;

    if (!isOwner) {
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
    }

    const exam = isOwner
      ? rawExam
      : await Exam.findById(req.params.id).select("-questions.correctAnswer");

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
    if (exam.status !== "Published") {
      return res.status(409).json({ status: "error", message: "This exam is not open for submissions." });
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

// ── Lecturer-facing exam authoring ──────────────────────────────

// Creates an exam in Draft status. Lecturers build exams incrementally
// (Save Draft can be called repeatedly before Publish), so this never
// requires questions to be present — validation of "is this exam
// actually complete" belongs to publishExam, not createExam.
exports.createExam = async (req, res) => {
  try {
    if (!isLecturer(req.user.role)) {
      return res.status(403).json({ status: "error", message: "Only lecturers can create exams" });
    }

    const {
      title,
      description,
      instructions,
      courseId,
      unit,
      duration,
      startTime,
      endTime,
      passMark,
      allowRetake,
      shuffleQuestions,
      showResultsImmediately,
      questions,
    } = req.body;

    if (!title || !title.trim()) {
      return res.status(400).json({ status: "error", message: "Title is required" });
    }
    if (!courseId) {
      return res.status(400).json({ status: "error", message: "courseId is required" });
    }
    if (!duration || duration <= 0) {
      return res.status(400).json({ status: "error", message: "A valid duration is required" });
    }

    const exam = await Exam.create({
      title,
      description,
      instructions,
      courseId,
      unit,
      duration,
      startTime: startTime || null,
      endTime: endTime || null,
      passMark,
      allowRetake,
      shuffleQuestions,
      showResultsImmediately,
      questions: Array.isArray(questions) ? questions : [],
      createdBy: req.user.id,
      status: "Draft",
    });

    res.status(201).json({ status: "success", data: exam });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error creating exam: " + error.message });
  }
};

// Full-object update. Only the lecturer who created the exam may edit
// it, and only while it's still Draft or Upcoming — editing a
// Published exam mid-flight could invalidate answers students already
// submitted against the old version, which is a data integrity
// problem, not just a UX one.
exports.updateExam = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ status: "error", message: "Invalid exam id" });
    }

    const exam = await Exam.findById(req.params.id);
    if (!exam) {
      return res.status(404).json({ status: "error", message: "Exam not found" });
    }
    if (exam.createdBy !== req.user.id) {
      return res.status(403).json({ status: "error", message: "You do not own this exam" });
    }
    if (!["Draft", "Upcoming"].includes(exam.status)) {
      return res.status(409).json({ status: "error", message: "Published or completed exams cannot be edited" });
    }

    const editableFields = [
      "title", "description", "instructions", "courseId", "unit",
      "duration", "startTime", "endTime", "passMark",
      "allowRetake", "shuffleQuestions", "showResultsImmediately", "questions",
    ];
    editableFields.forEach((field) => {
      if (req.body[field] !== undefined) {
        exam[field] = req.body[field];
      }
    });

    await exam.save();
    res.status(200).json({ status: "success", data: exam });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error updating exam: " + error.message });
  }
};

// Draft/Upcoming -> Published. Requires at least one question — this
// is where "is this exam actually ready" is enforced, deliberately
// not in createExam, so drafts can be saved incomplete.
exports.publishExam = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ status: "error", message: "Invalid exam id" });
    }

    const exam = await Exam.findById(req.params.id);
    if (!exam) {
      return res.status(404).json({ status: "error", message: "Exam not found" });
    }
    if (exam.createdBy !== req.user.id) {
      return res.status(403).json({ status: "error", message: "You do not own this exam" });
    }
    if (!exam.questions.length) {
      return res.status(400).json({ status: "error", message: "Cannot publish an exam with no questions" });
    }

    exam.status = "Published";
    await exam.save();

    const examCourse = await Course.findById(exam.courseId);
    notifyUsers({
      recipientIds: examCourse?.enrolledStudentIds || [],
      type: "exam_published",
      title: "New exam published",
      message: `"${exam.title}" is now available.`,
      link: `/student/exams/${exam._id}`,
      context: { courseId: exam.courseId, examId: exam._id },
    });

    res.status(200).json({ status: "success", data: exam });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error publishing exam: " + error.message });
  }
};

// Published -> Completed. A closed exam stops accepting new
// submissions (submitExam checks exam.status !== "Published" above)
// but remains visible to students who already took it, same as
// Completed exams already are in getStudentExams.
exports.closeExam = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ status: "error", message: "Invalid exam id" });
    }

    const exam = await Exam.findById(req.params.id);
    if (!exam) {
      return res.status(404).json({ status: "error", message: "Exam not found" });
    }
    if (exam.createdBy !== req.user.id) {
      return res.status(403).json({ status: "error", message: "You do not own this exam" });
    }
    if (exam.status !== "Published") {
      return res.status(409).json({ status: "error", message: "Only published exams can be closed" });
    }

    exam.status = "Completed";
    await exam.save();

    res.status(200).json({ status: "success", data: exam });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error closing exam: " + error.message });
  }
};

// Creates a new Draft copy of an existing exam — same questions,
// settings, and metadata, minus createdAt/updatedAt (regenerated) and
// minus the original's _id (Mongo assigns a new one). Always lands in
// Draft regardless of the source exam's status, since a duplicate is
// by definition unpublished and unreviewed until the lecturer commits
// to it again.
exports.duplicateExam = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ status: "error", message: "Invalid exam id" });
    }

    const original = await Exam.findById(req.params.id);
    if (!original) {
      return res.status(404).json({ status: "error", message: "Exam not found" });
    }
    if (original.createdBy !== req.user.id) {
      return res.status(403).json({ status: "error", message: "You do not own this exam" });
    }

    const copy = original.toObject();
    delete copy._id;
    delete copy.createdAt;
    delete copy.updatedAt;
    copy.title = `${copy.title} (Copy)`;
    copy.status = "Draft";
    copy.questions = copy.questions.map((q) => {
      const { _id, ...rest } = q;
      return rest;
    });

    const duplicate = await Exam.create(copy);
    res.status(201).json({ status: "success", data: duplicate });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error duplicating exam: " + error.message });
  }
};

// Draft-only deletion. A Published exam with real student submissions
// attached must never be hard-deleted — that would silently orphan
// ExamSubmission/ExamResult documents pointing at a examId that no
// longer resolves. Archiving is the correct path for retiring a live
// exam; this endpoint intentionally refuses anything past Draft.
exports.deleteExam = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ status: "error", message: "Invalid exam id" });
    }

    const exam = await Exam.findById(req.params.id);
    if (!exam) {
      return res.status(404).json({ status: "error", message: "Exam not found" });
    }
    if (exam.createdBy !== req.user.id) {
      return res.status(403).json({ status: "error", message: "You do not own this exam" });
    }
    if (exam.status !== "Draft") {
      return res.status(409).json({ status: "error", message: "Only draft exams can be deleted. Archive published exams instead." });
    }

    await exam.deleteOne();
    res.status(200).json({ status: "success", message: "Exam deleted" });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error deleting exam: " + error.message });
  }
};

// Lists exams created by the current lecturer, across every status
// including Draft — unlike getStudentExams, a lecturer needs to see
// their own drafts to keep working on them.
exports.getLecturerExams = async (req, res) => {
  try {
    if (!isLecturer(req.user.role)) {
      return res.status(403).json({ status: "error", message: "Only lecturers can view this list" });
    }

    const exams = await Exam.find({ createdBy: req.user.id }).sort({ createdAt: -1 });
    res.status(200).json({ status: "success", count: exams.length, data: exams });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching lecturer exams: " + error.message });
  }
};

// ============================================================
// GRADING
// ============================================================
// Deliberately deferred at submit time (see submitExam's comment) —
// this is that later work. All three functions below are scoped to
// exams the requesting lecturer created; there's no course-level
// indirection needed since Exam.createdBy already is the lecturer's
// own userId directly.

// Flat list of every submission across every exam this lecturer
// owns, newest first — GradeSubmissions.js calls this with no examId
// (its own per-exam filtering, if any, happens client-side), so this
// does not take one either. Joins in student name/email/
// admissionNumber and the parent exam's title, since SubmissionCard.js
// reads both nested under submission.student / submission.exam.
exports.getLecturerExamSubmissions = async (req, res) => {
  try {
    if (!isLecturer(req.user.role)) {
      return res.status(403).json({ status: "error", message: "Only lecturers can view this list" });
    }

    const exams = await Exam.find({ createdBy: req.user.id }).select("_id title");
    const examIds = exams.map((e) => e._id.toString());
    const examById = new Map(exams.map((e) => [e._id.toString(), e]));

    const submissions = await ExamSubmission.find({ examId: { $in: examIds } }).sort({ submittedAt: -1 });
    const studentIds = [...new Set(submissions.map((s) => s.studentId))];
    const students = await User.find({ _id: { $in: studentIds } }).select(
      "name email admissionNumber"
    );
    const studentById = new Map(students.map((u) => [u._id.toString(), u]));

    const results = await ExamResult.find({ examId: { $in: examIds } });
    const resultBySubmission = new Map(results.map((r) => [r.submissionId, r]));

    res.status(200).json({
      status: "success",
      count: submissions.length,
      data: submissions.map((sub) => {
        const result = resultBySubmission.get(sub._id.toString());
        const student = studentById.get(sub.studentId);
        const exam = examById.get(sub.examId);
        return {
          _id: sub._id,
          student: student
            ? { name: student.name, email: student.email, admissionNumber: student.admissionNumber }
            : null,
          exam: exam ? { title: exam.title } : null,
          score: result?.score ?? null,
          totalMarks: result?.totalMarks ?? null,
          status: result?.status || "Pending",
          submittedAt: sub.submittedAt,
        };
      }),
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching submissions: " + error.message });
  }
};

// One submission in full: each answer joined with its question's
// text/maxMarks from the parent Exam (ExamSubmission itself only
// stores questionId + the raw answer text), plus student and course
// info, plus any marks already awarded from a previous grading pass
// (so re-opening a graded submission shows existing marks, not blanks).
exports.getExamSubmissionById = async (req, res) => {
  try {
    if (!isLecturer(req.user.role)) {
      return res.status(403).json({ status: "error", message: "Only lecturers can view this" });
    }
    if (!isValidId(req.params.submissionId)) {
      return res.status(400).json({ status: "error", message: "Invalid submission id" });
    }

    const submission = await ExamSubmission.findById(req.params.submissionId);
    if (!submission) {
      return res.status(404).json({ status: "error", message: "Submission not found" });
    }

    const exam = await Exam.findById(submission.examId);
    if (!exam) {
      return res.status(404).json({ status: "error", message: "Parent exam not found" });
    }
    if (exam.createdBy !== req.user.id) {
      return res.status(403).json({ status: "error", message: "You do not own this exam" });
    }

    const student = await User.findById(submission.studentId).select("name email admissionNumber");
    const course = await Course.findById(exam.courseId).select("name");
    const result = await ExamResult.findOne({ submissionId: submission._id.toString() });

    const questionById = new Map(exam.questions.map((q) => [q._id.toString(), q]));
    const markByQuestion = new Map(
      (result?.questionMarks || []).map((m) => [m.questionId, m.marksAwarded])
    );

    res.status(200).json({
      status: "success",
      data: {
        _id: submission._id,
        student: student
          ? { name: student.name, email: student.email, admissionNumber: student.admissionNumber, course: course?.name || null }
          : null,
        exam: { title: exam.title, duration: exam.duration },
        submittedAt: submission.submittedAt,
        feedback: result?.feedback || "",
        status: result?.status || "Pending",
        totalMarks: result?.totalMarks ?? null,
        score: result?.score ?? null,
        answers: submission.answers.map((a) => {
          const question = questionById.get(a.questionId);
          return {
            questionId: a.questionId,
            question: question?.text || "(question no longer exists on this exam)",
            maxMarks: question?.marks ?? 0,
            response: a.answer,
            marks: markByQuestion.get(a.questionId) ?? 0,
          };
        }),
      },
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching submission: " + error.message });
  }
};

// Records/updates per-question marks for one submission. score is
// the sum of marksAwarded across all questions, clamped so a lecturer
// can't accidentally award more than a question's own max (the
// frontend's number input already caps at maxMarks, but that's
// client-side only and not trustworthy on its own). status is set
// against exam.passMark as a percentage of totalMarks — the first
// place in the codebase this comparison is made (see roles.js's note
// on centralizing repeated logic; this is new logic, not a copy).
exports.gradeExamSubmission = async (req, res) => {
  try {
    if (!isLecturer(req.user.role)) {
      return res.status(403).json({ status: "error", message: "Only lecturers can grade submissions" });
    }
    if (!isValidId(req.params.submissionId)) {
      return res.status(400).json({ status: "error", message: "Invalid submission id" });
    }

    const { marks, feedback } = req.body;
    if (!marks || typeof marks !== "object") {
      return res.status(400).json({ status: "error", message: "marks must be an object of questionId -> awarded marks" });
    }

    const submission = await ExamSubmission.findById(req.params.submissionId);
    if (!submission) {
      return res.status(404).json({ status: "error", message: "Submission not found" });
    }

    const exam = await Exam.findById(submission.examId);
    if (!exam) {
      return res.status(404).json({ status: "error", message: "Parent exam not found" });
    }
    if (exam.createdBy !== req.user.id) {
      return res.status(403).json({ status: "error", message: "You do not own this exam" });
    }

    const questionById = new Map(exam.questions.map((q) => [q._id.toString(), q]));

    const questionMarks = [];
    let score = 0;
    for (const [questionId, rawValue] of Object.entries(marks)) {
      const question = questionById.get(questionId);
      if (!question) continue; // silently skip marks for a question no longer on the exam
      const maxForQuestion = question.marks || 0;
      const awarded = Math.max(0, Math.min(Number(rawValue) || 0, maxForQuestion));
      questionMarks.push({ questionId, marksAwarded: awarded });
      score += awarded;
    }

    const result = await ExamResult.findOne({ submissionId: submission._id.toString() });
    if (!result) {
      return res.status(404).json({ status: "error", message: "No result record found for this submission" });
    }

    const percentage = result.totalMarks > 0 ? (score / result.totalMarks) * 100 : 0;

    result.questionMarks = questionMarks;
    result.score = score;
    result.status = percentage >= exam.passMark ? "Passed" : "Failed";
    result.feedback = feedback || "";
    result.gradedBy = req.user.id;
    result.gradedAt = new Date();
    await result.save();

    res.status(200).json({
      status: "success",
      data: {
        submissionId: submission._id,
        score: result.score,
        totalMarks: result.totalMarks,
        status: result.status,
        feedback: result.feedback,
        gradedAt: result.gradedAt,
      },
    });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error grading submission: " + error.message });
  }
};
