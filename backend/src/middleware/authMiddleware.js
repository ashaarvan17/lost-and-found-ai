//backend/src/middleware/authMiddleware.js


const jwt = require("jsonwebtoken");

exports.protect = (req, res, next) => {
  try {
    console.log("Authorization header received:", !!req.headers.authorization);
console.log("Bearer prefix present:", req.headers.authorization?.startsWith("Bearer "));
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

    // Attach the authenticated user's information to the request
    req.user = {
      userId: decoded.userId,
      role: decoded.role,
    };

    next();
  } catch (error) {
    return res.status(401).json({
      success: false,
      message: "Invalid or expired authentication token.",
    });
  }
};