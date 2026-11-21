const mongoose = require("mongoose");
const Claim = require("../models/Claim");
const ItemReport = require("../models/ItemReport");
const User = require("../models/User");
const LocalAdminAssignment = require("../models/LocalAdminAssignment");
const RecoveryTransaction = require("../models/RecoveryTransaction");
const AuditEvent = require("../models/AuditEvent");
const LocalAdminApplication = require("../models/LocalAdminApplication");
const { getRecoveryOtpSettings } = require("../config/recoveryOtp");
const { generateOtp, hashOtp, verifyOtp } = require("../services/recoveryOtp");

class RecoveryError extends Error { constructor(status, message) { super(message); this.status = status; } }
function normalizeArea(value) { return String(value || "").trim().normalize("NFKC").toLocaleLowerCase("en"); }
function requireObjectId(value, field, res) {
  if (mongoose.Types.ObjectId.isValid(value)) return true;
  res.status(400).json({ success: false, message: `A valid ${field} is required.` });
  return false;
}
function transactionDto(txn) {
  return { id: String(txn._id), claimId: txn.claimId ? String(txn.claimId) : null, itemId: String(txn.itemId), purpose: txn.purpose, status: txn.status, claimantId: txn.claimantId ? String(txn.claimantId) : null, finderId: String(txn.finderId), localAdminId: txn.localAdminId ? String(txn.localAdminId) : null, area: txn.area, otpGenerationCount: txn.otpGenerationCount, otpExpiresAt: txn.otpExpiresAt || null, otpLockedUntil: txn.otpLockedUntil || null, completedAt: txn.completedAt || null };
}
async function withTransaction(work) {
  const session = await mongoose.startSession();
  try {
    let result;
    await session.withTransaction(async () => { result = await work(session); });
    return result;
  } finally { await session.endSession(); }
}
function recordAudit({ actorId, action, resourceId, details }, session) {
  return AuditEvent.create([{ actorId, action, resourceType: "RecoveryTransaction", resourceId, details }], { session });
}

async function assertRecoveryAuthorizationInTransaction(txn, session, now) {
  let authorizedClaim = null;
  if (txn.claimId) {
    const claimFilter = { _id: txn.claimId, status: "verified", claimantId: txn.claimantId, finderId: txn.finderId };
    authorizedClaim = await Claim.findOne(claimFilter).session(session);
    if (!authorizedClaim) throw new RecoveryError(409, "Ownership verification is no longer active.");
    const claimWrite = await Claim.updateOne(claimFilter, { $set: { recoveryAuthorizationCheckedAt: now } }, { session });
    if (claimWrite.matchedCount !== 1) throw new RecoveryError(409, "Claim state changed; reload before recovery.");
  }
  if (txn.purpose !== "personal_handover") {
    const assignmentFilter = { _id: txn.localAdminAssignmentId, userId: txn.localAdminId, isActive: true };
    const assignment = await LocalAdminAssignment.findOne(assignmentFilter).session(session);
    if (!assignment || normalizeArea(assignment.assignedArea) !== normalizeArea(txn.area)) {
      throw new RecoveryError(409, "The assigned Local Admin is no longer active for this area.");
    }
    const assignmentWrite = await LocalAdminAssignment.updateOne(
      { ...assignmentFilter, assignedArea: assignment.assignedArea },
      { $set: { lastRecoveryOperationAt: now } },
      { session },
    );
    if (assignmentWrite.matchedCount !== 1) throw new RecoveryError(409, "Local Admin assignment changed; reload before recovery.");
  }
  return authorizedClaim;
}

exports.listAssignments = async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ success: false, message: "Main Admin access required" });
  try {
    const rows = await LocalAdminAssignment.find({}).populate("userId", "name").sort({ assignedAt: -1 });
    return res.json({ success: true, data: rows.map((row) => ({ id: String(row._id), userId: String(row.userId?._id || row.userId), name: row.userId?.name || "Unknown user", assignedArea: row.assignedArea, isActive: row.isActive, assignedBy: String(row.assignedBy), assignedAt: row.assignedAt, revokedAt: row.revokedAt })) });
  } catch { return res.status(500).json({ success: false, message: "Failed to list Local Admin assignments" }); }
};

exports.createAssignment = async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ success: false, message: "Main Admin access required" });
  const userId = req.body?.userId;
  const assignedArea = typeof req.body?.assignedArea === "string" ? req.body.assignedArea.trim() : "";
  if (!mongoose.Types.ObjectId.isValid(userId) || !assignedArea || assignedArea.length > 200) return res.status(400).json({ success: false, message: "A valid user and assigned area are required." });
  try {
    const user = await User.findById(userId).select("_id accountStatus role");
    if (!user) return res.status(404).json({ success: false, message: "User not found" });
    if (user.role !== "user" || user.accountStatus !== "local_admin_approved" || !await LocalAdminApplication.exists({ userId, status: "approved" })) {
      return res.status(409).json({ success: false, message: "Only an approved Local Admin applicant can receive an area assignment." });
    }
    const duplicate = await LocalAdminAssignment.findOne({ userId, isActive: true });
    if (duplicate && normalizeArea(duplicate.assignedArea) === normalizeArea(assignedArea)) return res.status(409).json({ success: false, message: "This user already has an active assignment for that area." });
    const row = await withTransaction(async (session) => {
      const [created] = await LocalAdminAssignment.create([{ userId, assignedArea, isActive: true, assignedBy: req.user.userId, assignedAt: new Date(), revokedAt: null }], { session });
      await AuditEvent.create([{ actorId: req.user.userId, action: "local_admin_assignment_created", resourceType: "LocalAdminAssignment", resourceId: created._id, details: { userId: String(userId), assignedArea } }], { session });
      return created;
    });
    return res.status(201).json({ success: true, data: { id: String(row._id), userId: String(row.userId), assignedArea: row.assignedArea, isActive: row.isActive, assignedBy: String(row.assignedBy), assignedAt: row.assignedAt } });
  } catch { return res.status(500).json({ success: false, message: "Failed to create Local Admin assignment" }); }
};

exports.updateAssignment = async (req, res) => {
  if (req.user.role !== "admin") return res.status(403).json({ success: false, message: "Main Admin access required" });
  if (!requireObjectId(req.params.assignmentId, "assignment ID", res)) return;
  const action = req.body?.action;
  if (!["activate", "deactivate", "revoke"].includes(action)) return res.status(400).json({ success: false, message: "Unsupported assignment action" });
  try {
    const { current, updated } = await withTransaction(async (session) => {
      const before = await LocalAdminAssignment.findById(req.params.assignmentId).session(session);
      if (!before) throw new RecoveryError(404, "Assignment not found");
      const update = action === "activate" ? { isActive: true, revokedAt: null } : { isActive: false, ...(action === "revoke" ? { revokedAt: new Date() } : {}) };
      const after = await LocalAdminAssignment.findOneAndUpdate({ _id: before._id, isActive: before.isActive, revokedAt: before.revokedAt }, { $set: update }, { new: true, session });
      if (!after) throw new RecoveryError(409, "Assignment changed; reload and retry.");
      await AuditEvent.create([{ actorId: req.user.userId, action: `local_admin_assignment_${action}d`, resourceType: "LocalAdminAssignment", resourceId: before._id, details: { userId: String(before.userId), assignedArea: before.assignedArea, previousActive: before.isActive, isActive: after.isActive, revokedAt: after.revokedAt } }], { session });
      return { current: before, updated: after };
    });
    return res.json({ success: true, data: { id: String(updated._id), isActive: updated.isActive, revokedAt: updated.revokedAt } });
  } catch (error) { if (error instanceof RecoveryError) return res.status(error.status).json({ success: false, message: error.message }); return res.status(500).json({ success: false, message: "Failed to update assignment" }); }
};

async function listLocalAdmins(area) {
  const candidates = await LocalAdminAssignment.find({ isActive: true });
  const matches = candidates.filter((assignment) => normalizeArea(assignment.assignedArea) === normalizeArea(area));
  const users = await User.find({ _id: { $in: matches.map((assignment) => assignment.userId) } }).select("name");
  const names = new Map(users.map((user) => [String(user._id), user.name]));
  return matches.map((assignment) => ({ assignmentId: String(assignment._id), userId: String(assignment.userId), name: names.get(String(assignment.userId)) || "Local Admin", area: assignment.assignedArea }));
}

exports.getAvailableAssignmentsForReport = async (req, res) => {
  if (!requireObjectId(req.params.reportId, "report ID", res)) return;
  try {
    const report = await ItemReport.findOne({ _id: req.params.reportId, userId: req.user.userId, type: "found" }).select("location");
    if (!report) return res.status(404).json({ success: false, message: "Found report not found" });
    return res.json({ success: true, data: await listLocalAdmins(report.location) });
  } catch { return res.status(500).json({ success: false, message: "Failed to load Local Admins" }); }
};

async function createRecoveryTransaction(data, actorId, action) {
  return withTransaction(async (session) => {
    const activeKey = data.purpose === "local_admin_deposit"
      ? `deposit:${data.itemId}`
      : `${data.purpose}:${data.claimId}`;
    const [txn] = await RecoveryTransaction.create([{ ...data, activeKey }], { session });
    await recordAudit({ actorId, action, resourceId: txn._id, details: { purpose: txn.purpose, itemId: String(txn.itemId), claimId: txn.claimId ? String(txn.claimId) : null } }, session);
    return txn;
  });
}

exports.createPersonalHandover = async (req, res) => {
  if (!requireObjectId(req.params.claimId, "claim ID", res)) return;
  try {
    const claim = await Claim.findOne({ _id: req.params.claimId, claimantId: req.user.userId, status: "verified" });
    if (!claim) return res.status(404).json({ success: false, message: "Verified claim not found" });
    const report = await ItemReport.findOne({ _id: claim.foundReportId, userId: claim.finderId, type: "found", status: "active" });
    if (!report || ![undefined, "with_finder"].includes(report.custodyStatus)) return res.status(409).json({ success: false, message: "Item is not available for personal handover." });
    const active = await RecoveryTransaction.findOne({ claimId: claim._id, purpose: "personal_handover", status: { $in: ["pending", "otp_issued"] } });
    if (active) return res.status(409).json({ success: false, message: "A personal handover transaction is already active for this claim." });
    const transaction = await createRecoveryTransaction({ claimId: claim._id, itemId: report._id, purpose: "personal_handover", status: "pending", claimantId: claim.claimantId, finderId: claim.finderId, area: report.location }, req.user.userId, "personal_handover_started");
    return res.status(201).json({ success: true, data: transactionDto(transaction) });
  } catch (error) { return res.status(error.code === 11000 ? 409 : 500).json({ success: false, message: error.code === 11000 ? "A personal handover transaction is already active for this claim." : "Failed to create personal handover" }); }
};

exports.createDeposit = async (req, res) => {
  if (!requireObjectId(req.params.reportId, "report ID", res)) return;
  if (!requireObjectId(req.body?.assignmentId, "assignment ID", res)) return;
  try {
    const report = await ItemReport.findOne({ _id: req.params.reportId, userId: req.user.userId, type: "found", status: "active" });
    if (!report) return res.status(404).json({ success: false, message: "Found report not found" });
    if (![undefined, "with_finder"].includes(report.custodyStatus)) return res.status(409).json({ success: false, message: "Item is not currently held by the finder." });
    const assignment = await getActiveAssignmentById(req.body.assignmentId, report.location);
    if (!assignment) return res.status(400).json({ success: false, message: "Select an active Local Admin assigned to this location." });
    const existing = await RecoveryTransaction.findOne({ itemId: report._id, purpose: "local_admin_deposit", status: { $in: ["pending", "otp_issued"] } });
    if (existing) return res.status(409).json({ success: false, message: "A deposit transaction is already active for this item." });
    const transaction = await createRecoveryTransaction({ itemId: report._id, purpose: "local_admin_deposit", status: "pending", finderId: req.user.userId, localAdminAssignmentId: assignment._id, localAdminId: assignment.userId, area: report.location }, req.user.userId, "local_admin_deposit_started");
    return res.status(201).json({ success: true, data: transactionDto(transaction) });
  } catch (error) { return res.status(error.code === 11000 ? 409 : 500).json({ success: false, message: error.code === 11000 ? "A deposit transaction is already active for this item." : "Failed to create deposit transaction" }); }
};

async function getActiveAssignmentById(assignmentId, area) {
  if (!assignmentId) return null;
  const assignment = await LocalAdminAssignment.findOne({ _id: assignmentId, isActive: true });
  return assignment && normalizeArea(assignment.assignedArea) === normalizeArea(area) ? assignment : null;
}

exports.createCollection = async (req, res) => {
  if (!requireObjectId(req.params.claimId, "claim ID", res)) return;
  try {
    const claim = await Claim.findOne({ _id: req.params.claimId, claimantId: req.user.userId, status: "verified" });
    if (!claim) return res.status(404).json({ success: false, message: "Verified claim not found" });
    const report = await ItemReport.findById(claim.foundReportId);
    if (!report || report.type !== "found" || report.custodyStatus !== "with_local_admin" || !report.custodianAssignmentId) return res.status(409).json({ success: false, message: "The item is not deposited with a Local Admin." });
    const deposit = await RecoveryTransaction.findOne({ itemId: report._id, purpose: "local_admin_deposit", status: "completed", localAdminAssignmentId: report.custodianAssignmentId });
    if (!deposit || String(deposit.finderId) !== String(claim.finderId)) return res.status(409).json({ success: false, message: "No completed deposit transaction authorizes this collection." });
    const assignment = await LocalAdminAssignment.findOne({ _id: report.custodianAssignmentId, userId: report.custodianUserId, isActive: true });
    if (!assignment || normalizeArea(assignment.assignedArea) !== normalizeArea(report.location)) return res.status(409).json({ success: false, message: "The assigned Local Admin is inactive or no longer authorized for this location." });
    const existing = await RecoveryTransaction.findOne({ claimId: claim._id, purpose: "local_admin_collection", status: { $in: ["pending", "otp_issued"] } });
    if (existing) return res.status(409).json({ success: false, message: "A collection transaction is already active for this claim." });
    const transaction = await createRecoveryTransaction({ claimId: claim._id, itemId: report._id, purpose: "local_admin_collection", status: "pending", claimantId: claim.claimantId, finderId: claim.finderId, localAdminAssignmentId: assignment._id, localAdminId: assignment.userId, area: report.location }, req.user.userId, "local_admin_collection_started");
    return res.status(201).json({ success: true, data: transactionDto(transaction) });
  } catch (error) { return res.status(error.code === 11000 ? 409 : 500).json({ success: false, message: error.code === 11000 ? "A collection transaction is already active for this claim." : "Failed to create collection transaction" }); }
};

exports.getClaimTransactions = async (req, res) => {
  if (!requireObjectId(req.params.claimId, "claim ID", res)) return;
  try {
    const claim = await Claim.findOne({ _id: req.params.claimId, status: "verified", $or: [{ claimantId: req.user.userId }, { finderId: req.user.userId }] });
    if (!claim) return res.status(404).json({ success: false, message: "Claim not found" });
    const rows = await RecoveryTransaction.find({ claimId: claim._id }).sort({ createdAt: 1 });
    return res.json({ success: true, data: rows.map(transactionDto) });
  } catch { return res.status(500).json({ success: false, message: "Failed to load recovery transactions" }); }
};

exports.getReportTransactions = async (req, res) => {
  if (!requireObjectId(req.params.reportId, "report ID", res)) return;
  try {
    const report = await ItemReport.findOne({ _id: req.params.reportId, userId: req.user.userId, type: "found" });
    if (!report) return res.status(404).json({ success: false, message: "Found report not found" });
    const rows = await RecoveryTransaction.find({ itemId: report._id }).sort({ createdAt: 1 });
    return res.json({ success: true, data: rows.map(transactionDto) });
  } catch { return res.status(500).json({ success: false, message: "Failed to load recovery transactions" }); }
};

exports.getLocalAdminTransactions = async (req, res) => {
  try {
    const assignments = await LocalAdminAssignment.find({ userId: req.user.userId, isActive: true });
    if (!assignments.length) return res.status(403).json({ success: false, message: "No active Local Admin assignment" });
    const rows = await RecoveryTransaction.find({ localAdminAssignmentId: { $in: assignments.map((assignment) => assignment._id) }, status: { $in: ["pending", "otp_issued"] } }).sort({ createdAt: 1 });
    return res.json({ success: true, data: rows.map(transactionDto) });
  } catch { return res.status(500).json({ success: false, message: "Failed to load assigned recovery tasks" }); }
};

exports.getMyLocalAdminAssignments = async (req, res) => {
  try {
    const assignments = await LocalAdminAssignment.find({ userId: req.user.userId, isActive: true }).select("assignedArea assignedAt").sort({ assignedArea: 1 });
    return res.json({ success: true, data: assignments.map((row) => ({ id: String(row._id), assignedArea: row.assignedArea, assignedAt: row.assignedAt })) });
  } catch {
    return res.status(500).json({ success: false, message: "Unable to load your active area assignments." });
  }
};

exports.getAvailableAssignmentsForClaim = async (req, res) => {
  if (!requireObjectId(req.params.claimId, "claim ID", res)) return;
  try {
    const claim = await Claim.findOne({ _id: req.params.claimId, finderId: req.user.userId });
    if (!claim) return res.status(404).json({ success: false, message: "Claim not found" });
    const report = await ItemReport.findOne({ _id: claim.foundReportId, userId: req.user.userId, type: "found" }).select("location");
    if (!report) return res.status(404).json({ success: false, message: "Found report not found" });
    return res.json({ success: true, data: await listLocalAdmins(report.location) });
  } catch { return res.status(500).json({ success: false, message: "Failed to load Local Admins" }); }
};

async function verifyOtpIssuerAuthorization(txn, userId) {
  const issuerId = txn.purpose === "local_admin_deposit" ? txn.finderId : txn.claimantId;
  if (String(issuerId) !== String(userId)) throw new RecoveryError(403, "You are not authorized to generate an OTP for this transaction.");
  if (txn.claimId) {
    const claim = await Claim.findOne({ _id: txn.claimId, status: "verified", claimantId: txn.claimantId, finderId: txn.finderId });
    if (!claim) throw new RecoveryError(409, "Ownership verification is no longer active.");
  }
  if (txn.purpose !== "personal_handover") {
    const assignment = await getActiveAssignmentById(txn.localAdminAssignmentId, txn.area);
    if (!assignment || String(assignment.userId) !== String(txn.localAdminId)) throw new RecoveryError(409, "The assigned Local Admin is no longer active for this area.");
  }
  const item = await ItemReport.findOne({ _id: txn.itemId, type: "found" });
  const expectedCustody = txn.purpose === "local_admin_collection" ? "with_local_admin" : "with_finder";
  const custodyAllowed = expectedCustody === "with_finder"
    ? [undefined, null, "with_finder"].includes(item?.custodyStatus)
    : item?.custodyStatus === expectedCustody;
  if (!item || !custodyAllowed) throw new RecoveryError(409, "The item's custody state no longer allows this transaction.");
}

exports.generateOtp = async (req, res) => {
  if (!requireObjectId(req.params.transactionId, "transaction ID", res)) return;
  try {
    const settings = getRecoveryOtpSettings();
    const txn = await RecoveryTransaction.findById(req.params.transactionId).select("+otpVerifier");
    if (!txn) return res.status(404).json({ success: false, message: "Recovery transaction not found" });
    await verifyOtpIssuerAuthorization(txn, req.user.userId);
    const now = new Date();
    if (!["pending", "otp_issued"].includes(txn.status)) return res.status(409).json({ success: false, message: "This recovery transaction cannot issue another OTP." });
    if (txn.otpLockedUntil && txn.otpLockedUntil > now) return res.status(423).json({ success: false, message: "OTP generation is locked until the security lockout expires." });
    if (txn.otpGenerationCount >= settings.maxGenerations) return res.status(429).json({ success: false, message: "The OTP generation limit for this transaction was reached." });
    if (txn.otpIssuedAt && now.getTime() - new Date(txn.otpIssuedAt).getTime() < settings.resendCooldownSeconds * 1000) return res.status(429).json({ success: false, message: "Please wait before generating another OTP." });
    const code = generateOtp(settings.digits);
    const verifier = await hashOtp(code);
    const expiresAt = new Date(now.getTime() + settings.validityMinutes * 60 * 1000);
    const event = { type: "otp_generated", actorId: req.user.userId, occurredAt: now };
    const updated = await withTransaction(async (session) => {
      await assertRecoveryAuthorizationInTransaction(txn, session, now);
      const saved = await RecoveryTransaction.findOneAndUpdate({
        _id: txn._id, status: { $in: ["pending", "otp_issued"] }, otpGeneration: txn.otpGeneration,
        otpGenerationCount: txn.otpGenerationCount, otpAttemptCount: txn.otpAttemptCount,
      }, {
        $set: { status: "otp_issued", otpVerifier: verifier, otpIssuedAt: now, otpExpiresAt: expiresAt, otpConsumedAt: null, otpAttemptCount: 0, otpLockedUntil: null },
        $inc: { otpGeneration: 1, otpGenerationCount: 1 }, $push: { events: event },
      }, { new: true, session });
      if (!saved) throw new RecoveryError(409, "Transaction changed; reload and retry.");
      await recordAudit({ actorId: req.user.userId, action: "recovery_otp_generated", resourceId: txn._id, details: { purpose: txn.purpose, generation: txn.otpGenerationCount + 1 } }, session);
      return saved;
    });
    return res.status(200).json({ success: true, data: { transaction: transactionDto(updated), otp: code, expiresAt, generationsRemaining: settings.maxGenerations - updated.otpGenerationCount } });
  } catch (error) {
    if (error instanceof RecoveryError) return res.status(error.status).json({ success: false, message: error.message });
    return res.status(500).json({ success: false, message: "Failed to generate recovery OTP" });
  }
};

async function authorizeOtpValidator(txn, userId) {
  if (txn.purpose === "personal_handover") {
    if (String(txn.finderId) !== String(userId)) throw new RecoveryError(403, "Only the finder can validate this handover OTP.");
  } else {
    if (String(txn.localAdminId) !== String(userId)) throw new RecoveryError(403, "Only the assigned Local Admin can validate this OTP.");
    const assignment = await getActiveAssignmentById(txn.localAdminAssignmentId, txn.area);
    if (!assignment || String(assignment.userId) !== String(userId)) throw new RecoveryError(403, "An active Local Admin assignment for this area is required.");
  }
  if (txn.claimId) {
    const claim = await Claim.findOne({ _id: txn.claimId, status: "verified", claimantId: txn.claimantId, finderId: txn.finderId });
    if (!claim) throw new RecoveryError(409, "Ownership verification is no longer active.");
  }
}

async function recordOtpRejection(txn, actorId, type, now, status, message) {
  await withTransaction(async (session) => {
    await RecoveryTransaction.updateOne({ _id: txn._id, otpGeneration: txn.otpGeneration }, { $push: { events: { type, actorId, occurredAt: now } } }, { session });
    await recordAudit({ actorId, action: `recovery_${type}`, resourceId: txn._id, details: { purpose: txn.purpose, generation: txn.otpGeneration } }, session);
  });
  return { status, message };
}

async function completeCustodyTransition(txn, actorId, session, now, authorizedClaim) {
  let filter;
  let set;
  if (txn.purpose === "personal_handover") {
    filter = { _id: txn.itemId, type: "found", userId: txn.finderId, status: "active", custodyStatus: { $in: ["with_finder", null] } };
    set = { custodyStatus: "with_owner", custodianUserId: txn.claimantId, custodianAssignmentId: null, status: "resolved" };
  } else if (txn.purpose === "local_admin_deposit") {
    filter = { _id: txn.itemId, type: "found", userId: txn.finderId, status: "active", custodyStatus: { $in: ["with_finder", null] } };
    set = { custodyStatus: "with_local_admin", custodianUserId: txn.localAdminId, custodianAssignmentId: txn.localAdminAssignmentId };
  } else {
    filter = { _id: txn.itemId, type: "found", status: "active", custodyStatus: "with_local_admin", custodianUserId: txn.localAdminId, custodianAssignmentId: txn.localAdminAssignmentId };
    set = { custodyStatus: "with_owner", custodianUserId: txn.claimantId, custodianAssignmentId: null, status: "resolved" };
  }
  const item = await ItemReport.findOneAndUpdate(filter, { $set: set }, { new: true, session });
  if (!item) throw new RecoveryError(409, "Item custody changed; this recovery transaction cannot complete.");

  let resolvedLostReportId = null;
  if (["personal_handover", "local_admin_collection"].includes(txn.purpose)) {
    if (!authorizedClaim?.lostReportId || String(authorizedClaim.foundReportId) !== String(txn.itemId)) {
      throw new RecoveryError(409, "The verified claim no longer identifies an active lost report.");
    }

    const lostReport = await ItemReport.findOneAndUpdate(
      { _id: authorizedClaim.lostReportId, userId: txn.claimantId, type: "lost", status: "active" },
      { $set: { status: "resolved" } },
      { new: true, session },
    );
    if (!lostReport) throw new RecoveryError(409, "The claimant's lost report is no longer active; recovery was not completed.");
    resolvedLostReportId = String(lostReport._id);
  }

  await recordAudit({ actorId, action: `recovery_${txn.purpose}_completed`, resourceId: txn._id, details: { itemId: String(txn.itemId), claimId: txn.claimId ? String(txn.claimId) : null, resolvedLostReportId, localAdminId: txn.localAdminId ? String(txn.localAdminId) : null, completedAt: now } }, session);
}

exports.validateOtp = async (req, res) => {
  if (!requireObjectId(req.params.transactionId, "transaction ID", res)) return;
  const code = req.body?.otp;
  if (typeof code !== "string" || !/^\d{6}$/.test(code)) return res.status(400).json({ success: false, message: "Enter the six-digit OTP." });
  try {
    const settings = getRecoveryOtpSettings();
    const txn = await RecoveryTransaction.findById(req.params.transactionId).select("+otpVerifier");
    if (!txn) return res.status(404).json({ success: false, message: "Recovery transaction not found" });
    await authorizeOtpValidator(txn, req.user.userId);
    const now = new Date();
    if (txn.status === "completed" || txn.otpConsumedAt) {
      const rejected = await recordOtpRejection(txn, req.user.userId, "otp_replayed", now, 409, "This OTP has already been consumed.");
      return res.status(rejected.status).json({ success: false, message: rejected.message });
    }
    if (txn.status !== "otp_issued" || !txn.otpVerifier) return res.status(409).json({ success: false, message: "No active OTP exists for this transaction." });
    if (txn.otpLockedUntil && txn.otpLockedUntil > now) {
      const rejected = await recordOtpRejection(txn, req.user.userId, "otp_locked", now, 423, "OTP validation is locked until the security lockout expires.");
      return res.status(rejected.status).json({ success: false, message: rejected.message, lockedUntil: txn.otpLockedUntil });
    }
    if (txn.otpAttemptCount >= settings.maxIncorrectAttempts) {
      const rejected = await recordOtpRejection(txn, req.user.userId, "otp_locked", now, 423, "This OTP has exhausted its incorrect-attempt limit. The issuer must generate a new OTP after lockout.");
      return res.status(rejected.status).json({ success: false, message: rejected.message });
    }
    if (!txn.otpExpiresAt || txn.otpExpiresAt <= now) {
      const rejected = await recordOtpRejection(txn, req.user.userId, "otp_expired", now, 410, "This OTP has expired. The issuer may generate another one if the transaction allows it.");
      return res.status(rejected.status).json({ success: false, message: rejected.message });
    }
    const valid = await verifyOtp(txn.otpVerifier, code);
    if (!valid) {
      const nextAttempt = txn.otpAttemptCount + 1;
      const lockedUntil = nextAttempt >= settings.maxIncorrectAttempts ? new Date(now.getTime() + settings.lockoutMinutes * 60 * 1000) : null;
      const result = await withTransaction(async (session) => {
        const saved = await RecoveryTransaction.findOneAndUpdate({ _id: txn._id, status: "otp_issued", otpGeneration: txn.otpGeneration, otpAttemptCount: txn.otpAttemptCount, otpConsumedAt: null, otpExpiresAt: { $gt: now }, "otpVerifier.hash": txn.otpVerifier.hash }, { $inc: { otpAttemptCount: 1 }, ...(lockedUntil ? { $set: { otpLockedUntil: lockedUntil } } : {}), $push: { events: { type: lockedUntil ? "otp_locked" : "otp_invalid", actorId: req.user.userId, occurredAt: now, attempt: nextAttempt } } }, { new: true, session });
        if (!saved) throw new RecoveryError(409, "OTP state changed; reload before trying again.");
        await recordAudit({ actorId: req.user.userId, action: lockedUntil ? "recovery_otp_locked" : "recovery_otp_invalid", resourceId: txn._id, details: { purpose: txn.purpose, generation: txn.otpGeneration, attempt: nextAttempt } }, session);
        return saved;
      });
      const status = lockedUntil ? 423 : 400;
      return res.status(status).json({ success: false, message: lockedUntil ? "Maximum incorrect attempts reached; validation is locked for 15 minutes." : "OTP is incorrect.", attemptsRemaining: Math.max(0, settings.maxIncorrectAttempts - result.otpAttemptCount), lockedUntil: result.otpLockedUntil || null });
    }
    const completed = await withTransaction(async (session) => {
      const authorizedClaim = await assertRecoveryAuthorizationInTransaction(txn, session, now);
      const saved = await RecoveryTransaction.findOneAndUpdate({ _id: txn._id, status: "otp_issued", otpGeneration: txn.otpGeneration, otpAttemptCount: txn.otpAttemptCount, otpConsumedAt: null, otpExpiresAt: { $gt: now }, "otpVerifier.hash": txn.otpVerifier.hash, $or: [{ otpLockedUntil: null }, { otpLockedUntil: { $lte: now } }] }, { $set: { status: "completed", otpConsumedAt: now, completedAt: now, completedBy: req.user.userId }, $unset: { activeKey: "" }, $push: { events: { type: "completed", actorId: req.user.userId, occurredAt: now } } }, { new: true, session });
      if (!saved) throw new RecoveryError(409, "OTP was already used or transaction state changed.");
      await completeCustodyTransition(txn, req.user.userId, session, now, authorizedClaim);
      return saved;
    });
    return res.status(200).json({ success: true, data: transactionDto(completed) });
  } catch (error) {
    if (error instanceof RecoveryError) return res.status(error.status).json({ success: false, message: error.message });
    return res.status(500).json({ success: false, message: "Failed to validate recovery OTP" });
  }
};
