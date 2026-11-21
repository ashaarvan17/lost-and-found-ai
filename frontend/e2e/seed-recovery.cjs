const { createRequire } = require("node:module");
const backendRequire = createRequire(require.resolve("../../backend/package.json"));
const bcrypt = backendRequire("bcrypt");
const User = require("../../backend/src/models/User");
const ItemReport = require("../../backend/src/models/ItemReport");
const MatchCandidate = require("../../backend/src/models/MatchCandidate");
const Claim = require("../../backend/src/models/Claim");
const LocalAdminAssignment = require("../../backend/src/models/LocalAdminAssignment");
const LocalAdminApplication = require("../../backend/src/models/LocalAdminApplication");
const RecoveryTransaction = require("../../backend/src/models/RecoveryTransaction");

module.exports = async function seedRecovery() {
  const password = await bcrypt.hash("Phase9-E2E-recovery-password-123", 12);
  const claimant = await User.create({ name: "E2E Claimant", email: "phase9-claimant@example.test", password });
  const finder = await User.create({ name: "E2E Finder", email: "phase9-finder@example.test", password });
  const localAdmin = await User.create({ name: "E2E Local Admin", email: "phase9-local-admin@example.test", password, accountStatus: "local_admin_approved" });
  const superAdmin = await User.findOne({ email: "phase9-super-admin@example.test" });
  await LocalAdminApplication.create({ userId: localAdmin._id, requestedArea: "Central Station", status: "approved", reviewedBy: superAdmin._id, reviewedAt: new Date() });
  const assignment = await LocalAdminAssignment.create({ userId: localAdmin._id, assignedArea: "Central Station", isActive: true, assignedBy: superAdmin._id });
  const lost = await ItemReport.create({ title: "E2E lost item", description: "Test-only report", type: "lost", category: "Personal Items", location: "Central Station", date: new Date(), userId: claimant._id });
  const found = await ItemReport.create({ title: "E2E found item", description: "Test-only private report", type: "found", category: "Personal Items", location: "Central Station", date: new Date(), userId: finder._id, status: "active", custodyStatus: "with_local_admin", custodianUserId: localAdmin._id, custodianAssignmentId: assignment._id, valueTier: "low", estimatedReplacementValueInr: 500 });
  const candidate = await MatchCandidate.create({ lostReportId: lost._id, foundReportId: found._id });
  const claim = await Claim.create({ candidateId: candidate._id, lostReportId: lost._id, foundReportId: found._id, claimantId: claimant._id, finderId: finder._id, valueTier: "low", questionSnapshot: [], requiredCorrect: 2, maxAttempts: 3, lockoutHours: 24, attemptCount: 2, status: "verified", verifiedAt: new Date() });
  await RecoveryTransaction.create({ claimId: claim._id, itemId: found._id, purpose: "local_admin_deposit", status: "completed", claimantId: claimant._id, finderId: finder._id, localAdminAssignmentId: assignment._id, localAdminId: localAdmin._id, area: "Central Station", completedAt: new Date() });

  for (const suffix of ["approve", "reject"]) {
    const reviewLost = await ItemReport.create({ title: `E2E ${suffix} review`, description: "Test-only review case", type: "lost", category: "Personal Items", location: "Central Station", date: new Date(), userId: claimant._id });
    const reviewCandidate = await MatchCandidate.create({ lostReportId: reviewLost._id, foundReportId: found._id });
    await Claim.create({ candidateId: reviewCandidate._id, lostReportId: reviewLost._id, foundReportId: found._id, claimantId: claimant._id, finderId: finder._id, valueTier: "low", questionSnapshot: [], requiredCorrect: 2, maxAttempts: 3, lockoutHours: 24, attemptCount: 3, attempts: [{ number: 1, outcome: "failed", createdAt: new Date() }, { number: 2, outcome: "failed", createdAt: new Date() }, { number: 3, outcome: "review_required", createdAt: new Date() }], status: "review_required" });
  }
};
