const jwt = require("jsonwebtoken");

module.exports = (req, res, next) => {
  const header = req.header("Authorization");

  if (!header) {
    return res.status(401).json({ status: "error", message: "No token provided" });
  }

  const token = header.startsWith("Bearer ") ? header.slice(7) : header;

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = decoded;
    next();
  } catch (error) {
    if (error.name === "TokenExpiredError") {
      return res.status(401).json({ status: "error", message: "Token has expired" });
    }
    return res.status(401).json({ status: "error", message: "Invalid token" });
  }
};
