const mongoose = require("mongoose");
const LocalAdminApplication = require("../models/LocalAdminApplication");
const User = require("../models/User");
const AuditEvent = require("../models/AuditEvent");

class ApplicationError extends Error { constructor(status, message) { super(message); this.status = status; } }

function requireSuperAdmin(req, res) {
  if (req.user.role === "admin") return true;
  res.status(403).json({ success: false, message: "Super Admin access required." });
  return false;
}

function applicationDto(application, user, includePrivate = false) {
  const dto = {
    id: String(application._id),
    applicant: { id: String(user?._id || application.userId), name: user?.name || "Unknown applicant", email: user?.email || "Unavailable" },
    requestedArea: application.requestedArea,
    status: application.status,
    createdAt: application.createdAt,
    reviewedAt: application.reviewedAt || null,
  };
  if (includePrivate) {
    dto.phone = application.phone || "";
    dto.verificationDetails = application.verificationDetails || "";
    dto.rejectionReason = application.rejectionReason || "";
  }
  return dto;
}

function validApplicationId(id) {
  return mongoose.Types.ObjectId.isValid(id);
}

exports.listApplications = async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  try {
    const rows = await LocalAdminApplication.find({}).sort({ createdAt: -1 }).populate("userId", "name email").lean();
    return res.json({ success: true, data: rows.map((row) => applicationDto(row, row.userId, true)) });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to load Local Admin applications." });
  }
};

exports.getApplication = async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  if (!validApplicationId(req.params.applicationId)) return res.status(404).json({ success: false, message: "Application not found." });
  try {
    const row = await LocalAdminApplication.findById(req.params.applicationId).populate("userId", "name email").lean();
    if (!row) return res.status(404).json({ success: false, message: "Application not found." });
    return res.json({ success: true, data: applicationDto(row, row.userId, true) });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to load this application." });
  }
};

exports.reviewApplication = async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  if (!validApplicationId(req.params.applicationId)) return res.status(404).json({ success: false, message: "Application not found." });
  const { action, reason = "" } = req.body || {};
  if (!["approve", "reject"].includes(action)) return res.status(400).json({ success: false, message: "Choose approve or reject." });
  if (typeof reason !== "string" || reason.trim().length > 1000 || (action === "reject" && !reason.trim())) {
    return res.status(400).json({ success: false, message: "A rejection reason of at most 1,000 characters is required." });
  }
  const now = new Date();
  const session = await mongoose.startSession();
  try {
    let reviewed;
    await session.withTransaction(async () => {
      const current = await LocalAdminApplication.findOne({ _id: req.params.applicationId, status: "pending" }).session(session);
      if (!current) throw new ApplicationError(409, "This application has already been reviewed or does not exist.");
      const status = action === "approve" ? "approved" : "rejected";
      const next = await LocalAdminApplication.findOneAndUpdate(
        { _id: current._id, status: "pending" },
        { $set: { status, reviewedBy: req.user.userId, reviewedAt: now, rejectionReason: action === "reject" ? reason.trim() : "" } },
        { new: true, session },
      );
      if (!next) throw new ApplicationError(409, "This application changed while it was being reviewed.");
      const accountStatus = action === "approve" ? "local_admin_approved" : "local_admin_rejected";
      const account = await User.findOneAndUpdate(
        { _id: current.userId, accountStatus: "local_admin_pending", role: "user" },
        { $set: { accountStatus } },
        { new: true, session },
      );
      if (!account) throw new ApplicationError(409, "Applicant account is no longer pending.");
      await AuditEvent.create([{
        actorId: req.user.userId,
        action: `local_admin_application_${action === "approve" ? "approved" : "rejected"}`,
        resourceType: "LocalAdminApplication",
        resourceId: current._id,
        details: { applicantId: String(current.userId), status, reason: reason.trim() },
      }], { session });
      reviewed = next;
    });
    return res.json({ success: true, message: action === "approve" ? "Application approved. Create a separate area assignment before Local Admin recovery access is available." : "Application rejected.", data: { id: String(reviewed._id), status: reviewed.status, reviewedAt: reviewed.reviewedAt } });
  } catch (error) {
    if (error instanceof ApplicationError) return res.status(error.status).json({ success: false, message: error.message });
    console.error("Local Admin application review failed.");
    return res.status(500).json({ success: false, message: "Unable to review this application." });
  } finally {
    await session.endSession();
  }
};
