const jwt = require("jsonwebtoken");
const User = require("../models/User");

module.exports = async (req, res, next) => {
  const header = req.header("Authorization");
  if (!header) {
    return res.status(401).json({ status: "error", message: "No token provided" });
  }
  const token = header.startsWith("Bearer ") ? header.slice(7) : header;
  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // tokenVersion check: rejects tokens issued before the account's
    // most recent forced-session-invalidation event (currently, only
    // a completed forgot-password reset). A token that verifies fine
    // cryptographically can still be stale in this sense, since JWTs
    // are otherwise stateless and have no way to be "revoked" early.
    const user = await User.findById(decoded.id).select("tokenVersion");
    if (!user || user.tokenVersion !== decoded.tokenVersion) {
      return res.status(401).json({ status: "error", message: "Session expired, please log in again" });
    }

    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ status: "error", message: "Token has expired" });
    }
    return res.status(401).json({ status: "error", message: "Invalid token" });
  }
};
