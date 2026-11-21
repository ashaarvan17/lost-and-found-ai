const express = require("express");
const { protect } = require("../middleware/authMiddleware");
const controller = require("../controllers/localAdminApplicationController");

const router = express.Router();
router.use(protect);
router.get("/", controller.listApplications);
router.get("/:applicationId", controller.getApplication);
router.post("/:applicationId/actions", controller.reviewApplication);

module.exports = router;
