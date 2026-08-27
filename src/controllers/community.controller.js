const mongoose = require("mongoose");
const User = require("../models/User");
const Comment = require("../models/Comment");
const Discussion = require("../models/Discussion");
const Club = require("../models/Club");
const Project = require("../models/Project");
const StudyGroup = require("../models/StudyGroup");
const Poll = require("../models/Poll");
const Announcement = require("../models/Announcement");
const Post = require("../models/Post");

const isValidId = (id) => mongoose.Types.ObjectId.isValid(id);
const isStaff = (role) => role === "lecturer" || role === "admin";

// ---------- Comments (on Posts) ----------

exports.getCommentsForPost = async (req, res) => {
  try {
    const comments = await Comment.find({ postId: req.params.postId }).sort({ createdAt: 1 });
    res.status(200).json({ status: "success", count: comments.length, data: comments });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching comments: " + error.message });
  }
};

exports.addComment = async (req, res) => {
  try {
    if (!isValidId(req.params.postId)) {
      return res.status(400).json({ status: "error", message: "Invalid post id" });
    }
    const post = await Post.findById(req.params.postId);
    if (!post) {
      return res.status(404).json({ status: "error", message: "Post not found" });
    }
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ status: "error", message: "content is required" });
    }
    const comment = await Comment.create({ postId: req.params.postId, userId: req.user.id, content });
    post.commentsCount = (post.commentsCount || 0) + 1;
    await post.save();
    res.status(201).json({ status: "success", data: comment });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error adding comment: " + error.message });
  }
};

// ---------- Discussion (per course) ----------

exports.getDiscussionForCourse = async (req, res) => {
  try {
    const posts = await Discussion.find({ courseId: req.params.courseId }).sort({ createdAt: 1 });
    res.status(200).json({ status: "success", count: posts.length, data: posts });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching discussion: " + error.message });
  }
};

exports.postDiscussion = async (req, res) => {
  try {
    const { content } = req.body;
    if (!content || !content.trim()) {
      return res.status(400).json({ status: "error", message: "content is required" });
    }
    const entry = await Discussion.create({
      courseId: req.params.courseId,
      userId: req.user.id,
      content
    });
    res.status(201).json({ status: "success", data: entry });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error posting to discussion: " + error.message });
  }
};

// ---------- Clubs ----------

exports.getClubs = async (req, res) => {
  try {
    const clubs = await Club.find({}).sort({ createdAt: -1 });
    res.status(200).json({ status: "success", count: clubs.length, data: clubs });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching clubs: " + error.message });
  }
};

exports.createClub = async (req, res) => {
  try {
    const { name, description } = req.body;
    if (!name) {
      return res.status(400).json({ status: "error", message: "name is required" });
    }
    const club = await Club.create({
      name,
      description,
      ownerId: req.user.id,
      memberIds: [req.user.id]
    });
    res.status(201).json({ status: "success", data: club });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error creating club: " + error.message });
  }
};

exports.joinClub = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ status: "error", message: "Invalid club id" });
    }
    const club = await Club.findById(req.params.id);
    if (!club) {
      return res.status(404).json({ status: "error", message: "Club not found" });
    }
    if (!club.memberIds.includes(req.user.id)) {
      club.memberIds.push(req.user.id);
      await club.save();
    }
    res.status(200).json({ status: "success", data: club });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error joining club: " + error.message });
  }
};

exports.leaveClub = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ status: "error", message: "Invalid club id" });
    }
    const club = await Club.findById(req.params.id);
    if (!club) {
      return res.status(404).json({ status: "error", message: "Club not found" });
    }
    club.memberIds = club.memberIds.filter((id) => id !== req.user.id);
    await club.save();
    res.status(200).json({ status: "success", data: club });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error leaving club: " + error.message });
  }
};

// ---------- Projects ----------

exports.getProjects = async (req, res) => {
  try {
    const projects = await Project.find({}).sort({ createdAt: -1 });
    res.status(200).json({ status: "success", count: projects.length, data: projects });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching projects: " + error.message });
  }
};

exports.createProject = async (req, res) => {
  try {
    const { title, description, status } = req.body;
    if (!title) {
      return res.status(400).json({ status: "error", message: "title is required" });
    }
    const project = await Project.create({
      title,
      description,
      status,
      ownerId: req.user.id,
      contributorIds: [req.user.id]
    });
    res.status(201).json({ status: "success", data: project });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error creating project: " + error.message });
  }
};

// ---------- Study Groups ----------

exports.getStudyGroups = async (req, res) => {
  try {
    const groups = await StudyGroup.find({}).sort({ createdAt: -1 });

    // Collect every distinct member id across all groups in one pass,
    // then fetch names in a single query rather than one query per
    // group - memberIds are stored as plain strings (see
    // StudyGroup.js), not real refs, so this can't use .populate().
    const allMemberIds = [...new Set(groups.flatMap((g) => g.memberIds))];
    const validIds = allMemberIds.filter((id) => mongoose.Types.ObjectId.isValid(id));

    const users = await User.find({ _id: { $in: validIds } }).select("name");
    const nameById = Object.fromEntries(users.map((u) => [u._id.toString(), u.name]));

    const groupsWithMemberNames = groups.map((group) => ({
      ...group.toObject(),
      members: group.memberIds.map((id) => ({
        id,
        name: nameById[id] || "Unknown user",
      })),
    }));

    res.status(200).json({ status: "success", count: groups.length, data: groupsWithMemberNames });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching study groups: " + error.message });
  }
};

exports.createStudyGroup = async (req, res) => {
  try {
    const { title, courseId, description, meetingTime, location } = req.body;
    if (!title) {
      return res.status(400).json({ status: "error", message: "title is required" });
    }
    const group = await StudyGroup.create({
      title,
      courseId,
      description,
      meetingTime,
      location,
      ownerId: req.user.id,
      memberIds: [req.user.id]
    });
    res.status(201).json({ status: "success", data: group });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error creating study group: " + error.message });
  }
};

exports.joinStudyGroup = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ status: "error", message: "Invalid study group id" });
    }
    const group = await StudyGroup.findById(req.params.id);
    if (!group) {
      return res.status(404).json({ status: "error", message: "Study group not found" });
    }
    if (!group.memberIds.includes(req.user.id)) {
      group.memberIds.push(req.user.id);
      await group.save();
    }
    res.status(200).json({ status: "success", data: group });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error joining study group: " + error.message });
  }
};

// ---------- Polls ----------

exports.getPolls = async (req, res) => {
  try {
    const polls = await Poll.find({}).sort({ createdAt: -1 });
    res.status(200).json({ status: "success", count: polls.length, data: polls });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching polls: " + error.message });
  }
};

exports.createPoll = async (req, res) => {
  try {
    const { question, options } = req.body;
    if (!question || !Array.isArray(options) || options.length < 2) {
      return res.status(400).json({ status: "error", message: "question and at least 2 options are required" });
    }
    const poll = await Poll.create({
      question,
      options: options.map((text) => ({ text, voterIds: [] })),
      createdBy: req.user.id
    });
    res.status(201).json({ status: "success", data: poll });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error creating poll: " + error.message });
  }
};

exports.voteOnPoll = async (req, res) => {
  try {
    if (!isValidId(req.params.id)) {
      return res.status(400).json({ status: "error", message: "Invalid poll id" });
    }
    const { optionIndex } = req.body;
    const poll = await Poll.findById(req.params.id);
    if (!poll) {
      return res.status(404).json({ status: "error", message: "Poll not found" });
    }
    if (typeof optionIndex !== "number" || !poll.options[optionIndex]) {
      return res.status(400).json({ status: "error", message: "Invalid optionIndex" });
    }

    // Duplicate-vote prevention: remove this user's vote from every
    // option first (in case they're switching their choice), then
    // add it to the chosen one.
    poll.options.forEach((opt) => {
      opt.voterIds = opt.voterIds.filter((id) => id !== req.user.id);
    });
    poll.options[optionIndex].voterIds.push(req.user.id);

    await poll.save();
    res.status(200).json({ status: "success", data: poll });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error voting on poll: " + error.message });
  }
};

// ---------- Announcements ----------

exports.getAnnouncements = async (req, res) => {
  try {
    const filter = req.query.courseId ? { courseId: req.query.courseId } : {};
    const announcements = await Announcement.find(filter).sort({ createdAt: -1 });
    res.status(200).json({ status: "success", count: announcements.length, data: announcements });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error fetching announcements: " + error.message });
  }
};

exports.createAnnouncement = async (req, res) => {
  try {
    if (!isStaff(req.user.role)) {
      return res.status(403).json({ status: "error", message: "Only lecturers or admins can post announcements" });
    }
    const { title, body, courseId } = req.body;
    if (!title || !body) {
      return res.status(400).json({ status: "error", message: "title and body are required" });
    }
    const announcement = await Announcement.create({ title, body, courseId, postedBy: req.user.id });
    res.status(201).json({ status: "success", data: announcement });
  } catch (error) {
    res.status(500).json({ status: "error", message: "Error creating announcement: " + error.message });
  }
};
