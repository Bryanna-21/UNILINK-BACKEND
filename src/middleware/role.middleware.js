// Role-based authorization. Must run AFTER auth.middleware.js, since it
// reads req.user which auth.middleware.js populates from the verified JWT.
//
// Usage:
//   const auth = require("../middleware/auth.middleware");
//   const requireRole = require("../middleware/role.middleware");
//   router.get("/admin/stats", auth, requireRole("admin"), ctrl.getStats);
//
// auth.middleware.js only proves WHO the user is (a valid token).
// requireRole proves the user is ALLOWED to do this specific thing.
// Never skip requireRole on admin routes and rely on the frontend alone —
// the frontend check is a UX convenience, this is the actual security.
module.exports = function requireRole(...allowedRoles) {
  return (req, res, next) => {
    if (!req.user) {
      // Defensive: requireRole was used without auth.middleware running first.
      return res.status(401).json({
        status: "error",
        message: "No authenticated user found",
      });
    }

    if (!allowedRoles.includes(req.user.role)) {
      return res.status(403).json({
        status: "error",
        message: "You do not have permission to perform this action",
      });
    }

    next();
  };
};
