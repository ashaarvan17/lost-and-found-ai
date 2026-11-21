# FindBack AI — Phase 11B Super Admin Verification Report

**Review date:** 2026-11-20  
**Scope:** Super Admin role creation and uniqueness, Local Admin approval/assignment separation, and applicant access controls. No production database or administrator account was accessed or modified.

## Summary

The inspected implementation and focused tests support the four requested controls. Public registration ignores a client-supplied role and creates the default `user` role. The Mongoose User schema declares a unique partial index for `role: "admin"`. Local Admin approval updates application/account status but explicitly requires a separate area assignment. Pending and rejected applicants are denied at login and by protected-request middleware.

The schema and unit tests do not prove that the unique index has been built and is enforcing uniqueness in the production MongoDB collection, nor do they prove how many production Super Admin accounts exist. Those checks require a safe, read-only production database inspection.

**Final status: PARTIALLY VERIFIED — implementation and focused tests passed; production account/index state requires manual verification.**

## Results

| Check | Result | Evidence and limits |
|---|---|---|
| Public registration cannot create a Super Admin | **Passed** | Registration reads only `name`, `email`, and `password`, omits the role in its `User.create` call, and returns the created user’s persisted role. An existing test submits `role: "admin"` and confirms the created data has no role and the response role is `user`. |
| Schema declares one-Super-Admin unique partial index | **Passed — schema review and unit test** | User schema declares `{ role: 1 }`, `unique: true`, and `partialFilterExpression: { role: "admin" }`, named `one_super_admin`. The focused test inspects the Mongoose schema. It does not inspect a production collection’s live indexes. |
| Local Admin approval does not automatically grant area assignment | **Passed** | Approval transaction changes the application to approved and account status to `local_admin_approved`, then audits the decision. It does not create an assignment and returns a message requiring a separate assignment. The test verifies this separation. |
| Pending and rejected applicants cannot access Local Admin features | **Passed — code review and focused tests** | Login rejects pending and rejected account statuses. `protect` reloads the account from MongoDB and rejects those statuses before continuing. It derives Local Admin status from an active assignment rather than a client-selected role. Tests cover pending/rejected denials and active-assignment recognition. |
| Assignment is a separate authorized action | **Passed — code review and focused tests** | Recovery routes require `protect`; assignment handlers require `role === "admin"`. Creation checks the target user is an approved applicant and records a separate audited assignment. Tests cover non-admin application review denial, assignment denial before approval, and explicit audited assignment after approval. |
| Production has exactly one Super Admin | **Not verified** | Production records were not accessed. |
| Production MongoDB enforces the unique partial index | **Not verified** | Production index metadata was not accessed. A schema declaration alone is insufficient evidence. |

### Failures

No focused test failed, and no implementation defect was identified in the scoped code review. Production account count and deployed index enforcement remain **unverified**, not failed, because this task intentionally did not access production.

## Focused tests executed

Command executed from `backend/`:

```text
node --test test/auth.test.js test/authMiddleware.test.js test/localAdminApplication.test.js
```

Result: **19 tests passed, 0 failed, 0 skipped.** These are unit tests; several database interactions are stubbed. The index test checks the schema declaration, not actual production MongoDB enforcement.

No MongoDB integration tests were run. No production or test database connection was made for this verification.

## Safe read-only production checks still required

Have an authorized operator use a read-only MongoDB credential, verify the intended cluster and database name independently, and run only these read operations against the production users collection:

```javascript
db.users.countDocuments({ role: "admin" })
db.users.getIndexes()
```

Verify that the count is exactly `1` and that the index list includes a unique index on `{ role: 1 }` with partial filter `{ role: "admin" }` (expected index name: `one_super_admin`). Record the environment, timestamp, count, and index key/options in the restricted operations record; do not record connection strings or credentials.

If the count is not exactly one or the index is missing/incorrect, stop. Do not run the provisioning command, promote/demote/delete accounts, or modify indexes as part of this verification. Escalate for an approved reconciliation and index rollout plan. Production account uniqueness remains unverified until both read-only checks complete successfully.

## Files changed

- Created [this report](./phase11b-admin-verification-report.md).
- No application code, tests, production records, administrator accounts, or database indexes were changed.

## Final status

**PARTIALLY VERIFIED — implementation and focused tests passed; production account/index state requires manual verification.**
