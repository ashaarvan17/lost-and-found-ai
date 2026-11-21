const express = require("express");
const router = express.Router();

const authController = require("../controllers/authController");
const { distributedRateLimit } = require("../middleware/distributedRateLimit");

const authLimit = distributedRateLimit({
  namespace: "auth",
  limit: Number.parseInt(process.env.AUTH_RATE_LIMIT_MAX || "20", 10),
  windowMs: Number.parseInt(process.env.AUTH_RATE_LIMIT_WINDOW_MS || "900000", 10),
  identity: (req) => req.body?.email,
});

router.post("/register", authLimit, authController.register);
router.post("/register-local-admin", authLimit, authController.applyAsLocalAdmin);
router.post("/login", authLimit, authController.login);
router.post("/admin/login", authLimit, authController.loginSuperAdmin);

module.exports = router;
