const people = require("../services/people.service");

// Thin HTTP layer: every decision is made in people.core.js. Unexpected errors are logged
// and answered generically (no internal messages leaked to the client).
const respond = (res, result) =>
  result.ok
    ? res.status(200).json({ status: "success", data: result.data })
    : res.status(result.status).json({ status: "error", message: result.message });

const wrap = (label, fn) => async (req, res) => {
  try {
    return respond(res, await fn(req));
  } catch (error) {
    console.error(`${label} error:`, error);
    return res.status(500).json({ status: "error", message: "Something went wrong. Please try again." });
  }
};

exports.search = wrap("People search", (req) => people.search(req.user.id, req.query.q));
exports.suggestions = wrap("People suggestions", (req) => people.suggest(req.user.id));
exports.checkUsername = wrap("Username check", (req) => people.checkUsername(req.user.id, req.query.u));
exports.changeUsername = wrap("Username change", (req) => people.changeUsername(req.user.id, req.body?.username));
exports.listBlocks = wrap("List blocks", (req) => people.listBlocks(req.user.id));
exports.block = wrap("Block user", (req) => people.block(req.user.id, req.params.userId));
exports.unblock = wrap("Unblock user", (req) => people.unblock(req.user.id, req.params.userId));
