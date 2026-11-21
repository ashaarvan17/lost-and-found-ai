# Resolved Item Visibility Fix

## Root cause

Final OTP recovery previously marked the found report as `resolved` but left the associated lost report `active`. Browse Items now intentionally includes resolved lost reports, so the linked report is shown with a Resolved badge. Found reports themselves are not publicly listed; their details remain private under the existing authorization rules. Older recoveries can still have a stale stored status, which read paths derive from verified claim and completed recovery records.

## Changes

- Final personal handover and Local Admin collection now resolve the found report and its verified claim's lost report atomically. The lost report must still belong to the claimant and be active; otherwise the recovery transaction rolls back. Local Admin deposit remains an intermediate custody state and does not resolve either report.
- Recovery audit details now include the resolved lost report ID.
- For older completed recoveries, read paths derive the lost report's effective resolved state only when the verified claim, completed final recovery transaction, and resolved found report all agree. Public browse includes these reports as resolved; match generation excludes them. Reporter history keeps them and displays the effective resolved status. Reads do not modify database records.
- Public browse lists lost reports with `active` or `resolved` status. Closed reports remain excluded, and found reports remain private. The frontend applies the same type/status allowlist and labels resolved cards clearly.
- Reporter history continues to return active and resolved lost/found reports. Dashboard report totals represent the reporter's history, and individual statuses remain visible; there is no separate active-report count. Match generation continues to consider active reports only, with found-report details restricted.
- Added backend lifecycle, browse, history, and privacy regressions, plus a frontend Playwright browse regression. Test-only ImageKit placeholder settings allow backend app tests to initialize without real ImageKit credentials.

## Files changed

- `backend/src/controllers/recoveryController.js`
- `backend/src/controllers/itemReportController.js`
- `backend/test/privacy.test.js`
- `backend/test/recoveryController.test.js`
- `backend/integration/mongo.integration.test.js`
- `backend/test/appContract.test.js`
- `frontend/src/pages/BrowseItems.jsx`
- `frontend/src/components/ItemCard.jsx`
- `frontend/src/components/components.css`
- `frontend/e2e/user-journey.spec.js`
- `frontend/playwright.config.js`
- `backend/docs/resolved-item-visibility-fix-report.md`

## Verification

- `backend`: `npm test` — **70 passed, 0 failed**.
- `frontend`: `npm run lint` — **passed**.
- `frontend`: `npm run build` — **passed**.
- `backend`: `npm run test:integration` — **blocked**. The configured isolated `_test` database passed the safety preflight, but MongoDB SRV lookup timed out before a database connection was made.
- `frontend`: `npm run test:e2e` — **blocked** during test database preparation by the same SRV DNS timeout. The test runner did not connect to or modify the test database.

No database records were modified. The compatibility read handles old completed recoveries without backfilling. A separate one-time Atlas reconciliation was rejected by automatic review because it would write persistent data without explicit approval; no such write was performed.
