//backend/src/middleware/authMiddleware.js


const jwt = require("jsonwebtoken");
const User = require("../models/User");
const LocalAdminAssignment = require("../models/LocalAdminAssignment");

exports.protect = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;

    // Check whether the Authorization header exists
    if (!authHeader || !authHeader.startsWith("Bearer ")) {
      return res.status(401).json({
        success: false,
        message: "Authentication required. Please log in.",
      });
    }

    // Extract the token
    const token = authHeader.split(" ")[1];

    if (!token) {
      return res.status(401).json({
        success: false,
        message: "Authentication token is missing.",
      });
    }

    // Verify the token
    if (!process.env.JWT_SECRET) {
      return res.status(500).json({
        success: false,
        message: "Authentication is temporarily unavailable.",
      });
    }

    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Resolve the current role from the database so role changes and deleted
    // accounts take effect before an existing token expires.
    const user = await User.findById(decoded.userId).select("_id role accountStatus");
    if (!user) {
      return res.status(401).json({
        success: false,
        message: "Invalid or expired authentication token.",
      });
    }

    if (["local_admin_pending", "local_admin_rejected"].includes(user.accountStatus)) {
      return res.status(403).json({ success: false, message: "This account is not approved for access." });
    }

    const activeAssignment = user.role === "admin" ? null : await LocalAdminAssignment.exists({ userId: user._id, isActive: true });

    req.user = {
      userId: String(user._id),
      role: user.role,
      accountStatus: user.accountStatus || "active",
      isLocalAdmin: Boolean(activeAssignment),
    };

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired authentication token.",
    });
  }
};

// Public lost-report views may be read without a session. If a caller supplies
// a token, it must still be valid before ownership checks can use it.
exports.optionalProtect = (req, res, next) => {
  const authHeader = req.headers.authorization;
  if (!authHeader) return next();
  return exports.protect(req, res, next);
};
