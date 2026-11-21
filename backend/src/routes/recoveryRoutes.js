const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const recovery = require("../controllers/recoveryController");
const { distributedRateLimit } = require("../middleware/distributedRateLimit");
const router = express.Router();
router.use(protect);
const recoveryLimit = distributedRateLimit({
  namespace: "recovery_otp",
  limit: Number.parseInt(process.env.RECOVERY_RATE_LIMIT_MAX || "30", 10),
  windowMs: Number.parseInt(process.env.RECOVERY_RATE_LIMIT_WINDOW_MS || "900000", 10),
});

router.get("/admin/local-admin-assignments", recovery.listAssignments);
router.post("/admin/local-admin-assignments", recovery.createAssignment);
router.patch("/admin/local-admin-assignments/:assignmentId", recovery.updateAssignment);

router.get("/local-admin/transactions", recovery.getLocalAdminTransactions);
router.get("/local-admin/assignments", recovery.getMyLocalAdminAssignments);
router.get("/claims/:claimId/local-admins", recovery.getAvailableAssignmentsForClaim);
router.get("/claims/:claimId/transactions", recovery.getClaimTransactions);
router.post("/claims/:claimId/personal-handover", recovery.createPersonalHandover);
router.post("/claims/:claimId/collection", recovery.createCollection);
router.get("/reports/:reportId/local-admins", recovery.getAvailableAssignmentsForReport);
router.get("/reports/:reportId/transactions", recovery.getReportTransactions);
router.post("/reports/:reportId/deposit", recovery.createDeposit);

router.post("/transactions/:transactionId/otp", recoveryLimit, recovery.generateOtp);
router.post("/transactions/:transactionId/validate", recoveryLimit, recovery.validateOtp);
module.exports = router;
