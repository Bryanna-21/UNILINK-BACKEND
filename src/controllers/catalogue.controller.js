const catalogue = require("../services/catalogue.service");

// Thin HTTP layer: every decision is made in catalogue.core.js.
const respond = (res, result) => {
  if (!result.ok) return res.status(result.status).json({ status: "error", message: result.message });
  const body = { status: "success" };
  if (result.count !== undefined) body.count = result.count;
  body.data = result.data;
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

exports.institutions = wrap("List institutions", (req) => catalogue.listInstitutions(req.user.id, req.query));
exports.institutionCourses = wrap("List institution courses", (req) => catalogue.listInstitutionCourses(req.user.id, req.params.id, req.query));
exports.courseUnits = wrap("Course units", (req) => catalogue.courseUnits(req.user.id, req.params.courseId));
exports.myUnits = wrap("My units", (req) => catalogue.myUnits(req.user.id));
exports.adminImport = wrap("Catalogue import", (req) => catalogue.importCourses(req.user.id, req.body));
exports.adminVerify = wrap("Catalogue verify", (req) => catalogue.verifyCourse(req.user.id, req.params.courseId, req.body?.verified));
