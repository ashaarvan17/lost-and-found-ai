const ItemReport = require("../models/ItemReport");
const LocalAdminApplication = require("../models/LocalAdminApplication");
const LocalAdminAssignment = require("../models/LocalAdminAssignment");
const AuditEvent = require("../models/AuditEvent");

function requireSuperAdmin(req, res) {
  if (req.user?.role === "admin") return true;
  res.status(403).json({ success: false, message: "Super Admin access required." });
  return false;
}

exports.getDashboardStats = async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;
  try {
    const [lostReports, foundReports, resolvedReports, pendingApplications, approvedApplications, activeAssignments] = await Promise.all([
      ItemReport.countDocuments({ type: "lost" }),
      ItemReport.countDocuments({ type: "found" }),
      ItemReport.countDocuments({ status: "resolved" }),
      LocalAdminApplication.countDocuments({ status: "pending" }),
      LocalAdminApplication.countDocuments({ status: "approved" }),
      LocalAdminAssignment.countDocuments({ isActive: true }),
    ]);
    await AuditEvent.create([{
      actorId: req.user.userId,
      action: "super_admin_dashboard_viewed",
      resourceType: "SuperAdminDashboard",
      resourceId: req.user.userId,
      details: { lostReports, foundReports, resolvedReports, pendingApplications, approvedApplications, activeAssignments },
    }]);
    return res.json({ success: true, data: { lostReports, foundReports, resolvedReports, pendingApplications, approvedApplications, activeAssignments } });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to load Super Admin dashboard statistics." });
  }
};

exports.getReports = async (req, res) => {
  if (!requireSuperAdmin(req, res)) return;

  const view = req.query.view;
  let filter;
  if (view === "lost") filter = { type: "lost", status: "active" };
  else if (view === "found") filter = { type: "found", status: "active" };
  else if (view === "resolved") filter = { status: "resolved" };
  else return res.status(400).json({ success: false, message: "Choose lost, found, or resolved reports." });

  const page = Number.parseInt(req.query.page, 10) || 1;
  const pageSize = Number.parseInt(req.query.pageSize, 10) || 25;
  if (page < 1 || pageSize < 1 || pageSize > 100) {
    return res.status(400).json({ success: false, message: "Page must be positive and page size must be between 1 and 100." });
  }

  try {
    const [total, rows] = await Promise.all([
      ItemReport.countDocuments(filter),
      ItemReport.find(filter)
        .select("title description type category location date status createdAt userId")
        .populate("userId", "name email")
        .sort({ createdAt: -1, _id: -1 })
        .skip((page - 1) * pageSize)
        .limit(pageSize)
        .lean(),
    ]);
    await AuditEvent.create([{
      actorId: req.user.userId,
      action: "super_admin_reports_viewed",
      resourceType: "SuperAdminReportListing",
      resourceId: req.user.userId,
      details: { view, page, pageSize, resultCount: rows.length, total },
    }]);
    const data = rows.map((report) => ({
      id: String(report._id),
      title: report.title,
      description: report.description,
      type: report.type,
      category: report.category,
      location: report.location,
      date: report.date,
      status: report.status,
      createdAt: report.createdAt,
      owner: report.userId ? {
        id: String(report.userId._id),
        name: report.userId.name || "Unknown user",
        email: report.userId.email || "Unavailable",
      } : null,
    }));
    return res.json({ success: true, data, pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) } });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to load item reports." });
  }
};
