const units = require("../services/units.service");

// Thin HTTP layer: every decision is made in units.core.js. The success shapes match the old
// course endpoints ({ status, data } and { status, count, data }) so existing clients keep working.
const respond = (res, result) => {
  if (!result.ok) return res.status(result.status).json({ status: "error", message: result.message });
  const body = { status: "success" };
  if (result.count !== undefined) body.count = result.count;
  body.data = result.data;
  if (result.enrolled !== undefined) body.enrolled = result.enrolled;
  if (result.alreadyEnrolled !== undefined) body.alreadyEnrolled = result.alreadyEnrolled;
  return res.status(200).json(body);
};

const wrap = (label, fn) => async (req, res) => {
  try {
    return respond(res, await fn(req));
  } catch (error) {
    console.error(`${label} error:`, error);
    return res.status(500).json({ status: "error", message: "Something went wrong. Please try again." });
  }
};

exports.list = wrap("List courses", (req) => units.listCourses(req.user.id));
exports.getCourseById = wrap("Get course", (req) => units.getCourse(req.user.id, req.params.id));
exports.available = wrap("Available units", (req) => units.available(req.user.id, req.query.q));
exports.enroll = wrap("Enrol", (req) => units.enroll(req.user.id, req.params.id));
exports.unenroll = wrap("Unenrol", (req) => units.unenroll(req.user.id, req.params.id));
