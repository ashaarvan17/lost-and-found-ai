const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const { beginClaim, getMyClaims, submitAnswers, getReviewQueue, getReviewDetails, reviewClaim, submitReviewInformation } = require("../controllers/claimController");
const { getMessages, sendMessage, reportIssue } = require("../controllers/conversationController");
const { distributedRateLimit } = require("../middleware/distributedRateLimit");
const router = express.Router();
router.use(protect);
const claimLimit = distributedRateLimit({
  namespace: "claim_action",
  limit: Number.parseInt(process.env.CLAIM_RATE_LIMIT_MAX || "20", 10),
  windowMs: Number.parseInt(process.env.CLAIM_RATE_LIMIT_WINDOW_MS || "900000", 10),
});
router.get("/my-claims", getMyClaims);
router.get("/admin/review", getReviewQueue);
router.get("/admin/review/:claimId", getReviewDetails);
router.post("/admin/review/:claimId/actions", reviewClaim);
router.post("/matches/:candidateId", claimLimit, beginClaim);
router.post("/:claimId/verify", claimLimit, submitAnswers);
router.post("/:claimId/review-information", submitReviewInformation);
router.get("/:claimId/messages", getMessages);
router.post("/:claimId/messages", sendMessage);
router.post("/:claimId/issues", reportIssue);
module.exports = router;
