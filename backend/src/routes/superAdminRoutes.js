const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const controller = require("../controllers/superAdminController");

const router = express.Router();
router.get("/dashboard/stats", protect, controller.getDashboardStats);
router.get("/reports", protect, controller.getReports);

module.exports = router;
