# Phase 9A — Authentication and Local Admin approval

## Existing role mapping

The existing `User.role` values are `user` and `admin`. In this application, `admin` remains the Main Admin authority and is presented as **Super Admin** in the UI. No new global Local Admin role is added. A Local Admin applicant remains a `user`; recovery authority comes only from an approved application plus a separate active `LocalAdminAssignment` for the relevant area.

Public registration ignores any submitted role. The `User` schema now has a partial unique index for `role: "admin"`, so no second Super Admin can be created after the index is installed. Before installing this index in a database that contains legacy accounts, check and manually reconcile duplicate `admin` records; the provisioning command intentionally stops if it finds more than one.

## One-time Super Admin provisioning

There is no public Super Admin registration route or frontend credential. Provision the first account from a trusted backend environment. Configure `MONGODB_URI` for the intended database and provide `SUPER_ADMIN_NAME`, `SUPER_ADMIN_EMAIL`, and a unique `SUPER_ADMIN_PASSWORD` of 12–72 UTF-8 bytes in a protected process environment. Then run:

```powershell
Set-Location backend
npm.cmd run provision:super-admin
```

The command creates the unique role index first, refuses an existing admin account, hashes the password, creates at most one `admin` user, and disconnects. It never prints the supplied values. Remove the provisioning variables from the shell/secret manager after the run. If an admin is already provisioned, use the existing account; this command will not create another.

## Local Admin application flow

`POST /api/auth/register-local-admin` accepts the applicant's name, email, password, requested area, and optional phone/additional details. It creates the ordinary account in `local_admin_pending` status and a private `LocalAdminApplication` in a MongoDB transaction. The returned confirmation contains only the application ID, requested area, and pending state.

Pending and rejected applicants receive no JWT on login. Protected requests also re-read account status from MongoDB and deny pending/rejected accounts, so a stale token or edited browser state cannot bypass review. Approval changes the application and account status atomically and writes an `AuditEvent`; rejection requires a reason and does the same. Review list/details/actions require the existing `admin` role and expose application contact/verification details only to that role.

Approval does not create an assignment. The Super Admin must separately create an area assignment for an approved applicant. The assignment API now rejects ordinary, pending, and rejected accounts; existing recovery handlers continue to check assignment activity and area for each operation.

## Frontend behavior

- Login uses one role-neutral credential form. The backend returns the role and account status; the UI never submits a role as an authorization decision.
- Registration has regular-user and Local Admin application modes. There is no Super Admin registration option.
- Pending applicants see a confirmation screen. Pending/rejected status is repeated after successful password verification, without returning a token.
- Admin navigation and admin routes resolve the current user from `/api/auth/me`; backend routes remain authoritative.
- User dashboard counts/reports/matches/claims use existing authenticated APIs instead of sample constants. The public browse route lists only backend-approved public lost reports, and the dashboard search submits to it. The unimplemented notification bell was removed.

## Verification status

Mock-isolated backend unit tests verify public role stripping, pending/rejected login denial, approved login under the ordinary role, single-admin index metadata, admin-only application review, approve/reject auditing, double-review rejection, and assignment only after approval. The replica-set integration suite now exercises application submission, pending login denial, Super Admin approval, approved login, and the separate area assignment.

Database-backed integration and Playwright journeys still require the dedicated `_test` replica set. Their earlier Phase 8 production-verification gap remains open until those suites actually execute; this UI/authentication change does not mark production verification complete.

Latest Phase 9A verification in this workspace:

- Backend unit suite: **65 passed, 0 failed**.
- Frontend ESLint and Vite production build: **passed**.
- JavaScript syntax checks: **55 files passed** (CommonJS checked normally; the legacy ESM API helper checked in module mode).
- Playwright test discovery: **2 journeys found**. The browser E2E suite was not executed because `MONGODB_TEST_URI` is not configured.
- Responsive UI smoke check: landing, login, regular registration, Local Admin registration, and public browse were opened at 390 px width; no horizontal overflow was found. The backend was not connected for this visual check.
- `git diff --check` and staged diff check: **passed**.

The MongoDB integration runner also stopped at its isolation preflight because `MONGODB_TEST_URI` is absent. It did not connect to or modify a database. A dedicated replica-set run and browser journey remain required before production verification can be called complete.
