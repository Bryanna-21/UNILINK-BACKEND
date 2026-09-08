// Middleware to check if user has required role
const requireRole = (roles) => {
  return (req, res, next) => {
    if (!req.user) {
      return res.status(401).json({ message: "Unauthorized" });
    }

    if (!roles.includes(req.user.role)) {
      return res.status(403).json({ message: "Forbidden - insufficient permissions" });
    }

    next();
  };
};

// Specific middleware for superadmin
const requireSuperadmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (req.user.role !== "superadmin") {
    return res.status(403).json({ message: "Forbidden - superadmin access required" });
  }

  next();
};

// Specific middleware for admin or superadmin
const requireAdminOrSuperadmin = (req, res, next) => {
  if (!req.user) {
    return res.status(401).json({ message: "Unauthorized" });
  }

  if (req.user.role !== "admin" && req.user.role !== "superadmin") {
    return res.status(403).json({ message: "Forbidden - admin access required" });
  }

  next();
};

module.exports = {
  requireRole,
  requireSuperadmin,
  requireAdminOrSuperadmin,
};
