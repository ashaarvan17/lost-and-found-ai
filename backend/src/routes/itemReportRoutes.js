// backend/src/routes/itemReportRoutes.js

const express = require("express");
const router = express.Router();

const {
    createReport,
    getAllReports,
    getMyReports,
    getReportById
} = require("../controllers/itemReportController");

const { protect } = require("../middleware/authMiddleware");



const upload = require("../middleware/uploadMiddleware");

router.post("/", protect, upload.single("image"), createReport);

// Get reports belonging to the logged-in user — login required
// IMPORTANT: This route must appear before "/:id"
router.get("/my-reports", protect, getMyReports);

// Get all reports — used by Browse Items
router.get("/", getAllReports);

// Get one report by ID
router.get("/:id", getReportById);

module.exports = router;