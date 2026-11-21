// backend/src/routes/itemReportRoutes.js

const express = require("express");
const router = express.Router();

const {
    createReport,
    getAllReports,
    getMyReports,
    getReportById , getMyMatches, getPrivateReportImage
} = require("../controllers/itemReportController");
const { updateOwnershipQuestions, elevateValueTier } = require("../controllers/itemReportController");
const { parseEstimatedValue, assignValueTier, getQuestionCount, getItemValueTierSettings } = require("../config/itemValueTier");

const { protect, optionalProtect } = require("../middleware/authMiddleware");




const upload = require("../middleware/uploadMiddleware");
const { distributedRateLimit } = require("../middleware/distributedRateLimit");
const reportCreateLimit = distributedRateLimit({
    namespace: "report_create",
    limit: Number.parseInt(process.env.REPORT_RATE_LIMIT_MAX || "30", 10),
    windowMs: Number.parseInt(process.env.REPORT_RATE_LIMIT_WINDOW_MS || "900000", 10),
});
const matchLimit = distributedRateLimit({
    namespace: "match_lookup",
    limit: Number.parseInt(process.env.MATCH_RATE_LIMIT_MAX || "30", 10),
    windowMs: Number.parseInt(process.env.MATCH_RATE_LIMIT_WINDOW_MS || "900000", 10),
});

// Get potential matches for the logged-in user's reports
router.get("/matches/my-matches", protect, matchLimit, getMyMatches);
router.get("/value-tier-preview", protect, (req, res) => {
    const amount = parseEstimatedValue(req.query.estimatedValueInr);
    const valueTier = assignValueTier(amount);
    if (amount === null || !valueTier) return res.status(400).json({ success: false, message: "Enter a valid whole-number amount in INR." });
    const thresholds = getItemValueTierSettings();
    return res.json({ success: true, data: { valueTier, questionCount: getQuestionCount(valueTier), thresholds } });
});
router.patch("/:id/ownership-questions", protect, updateOwnershipQuestions);
router.patch("/:id/value-tier", protect, elevateValueTier);
router.post("/", protect, reportCreateLimit, upload.single("image"), createReport);

// Get reports belonging to the logged-in user — login required
// IMPORTANT: This route must appear before "/:id"
router.get("/my-reports", protect, getMyReports);
router.get("/:id/image", protect, getPrivateReportImage);

// Get all reports — used by Browse Items
router.get("/", getAllReports);

// Get one report by ID
router.get("/:id", optionalProtect, getReportById);

module.exports = router;
