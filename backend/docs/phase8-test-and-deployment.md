# Phase 8 – Production Readiness and Integration Verification

## Scope and decision

Phase 8 adds a guarded local MongoDB replica set, a real-database integration suite, browser smoke coverage, shared MongoDB-backed request limits, current-role checks for authenticated requests, upload image decoding and pixel limits, signed finder-only image delivery, production environment validation, and deployment operations guidance. Existing routes and UI layouts remain in place.

The repository has no production credentials or production infrastructure attached. This report separates checks executed here from tests that require your local replica set, ImageKit account, Gemini credentials, and deployment environment.

## MongoDB setup and isolation

See [the local replica-set instructions](../../database/README.md) and [the compose file](../../database/docker-compose.yml). The local stack is loopback-only and intended for development and integration testing. It uses a one-member `rs0` replica set so multi-document transactions can run; this is not a production high-availability deployment. MongoDB transactions require a replica set or sharded cluster; see the [MongoDB transaction documentation](https://www.mongodb.com/docs/manual/core/transactions/) and [replica-set deployment documentation](https://www.mongodb.com/docs/manual/tutorial/deploy-replica-set/).

The backend integration runner and Playwright runner read only `MONGODB_TEST_URI`. They require the parsed database name to end exactly in `_test`, verify a replica-set handshake, and never fall back to `MONGODB_URI`. Local loopback hosts are accepted by default. Remote testing requires `MONGODB_TEST_ALLOW_REMOTE=true` and an exact `MONGODB_TEST_HOST` allowlist; the runner refuses the same non-local hostname configured in `backend/.env` as `MONGODB_URI`. Use a dedicated test cluster, because hostname checks cannot detect aliases for the same Atlas cluster. The integration suite clears the selected test database before and after execution. The browser runner clears it before starting the application. Never point either variable at development or production data.

Commands, from the repository root:

```powershell
docker compose -f database/docker-compose.yml up -d mongodb
docker compose -f database/docker-compose.yml run --rm replica-init
docker compose -f database/docker-compose.yml exec mongodb mongosh --quiet --eval "db.hello().isWritablePrimary"
Copy-Item backend/.env.test.example backend/.env.test
Set-Location backend
npm.cmd run test:integration
```

The expected replica-set check is `true`. Development uses `MONGODB_URI=.../findback_dev?replicaSet=rs0`; integration tests use `MONGODB_TEST_URI=.../findback_test?replicaSet=rs0`. Keep the variables distinct. The test scripts refuse non-test database names even when `MONGODB_URI` is also set.

## Integration coverage

The real MongoDB suite is [mongo.integration.test.js](../integration/mongo.integration.test.js). It covers:

- Replica-set connection, connection state, disconnect/reconnect, and persisted users, reports, and claims after an HTTP-server restart.
- Registration, duplicate registration, login failure/success, current-role authorization, and demoted-admin denial.
- Lost/found report creation and persistence, server-derived value tier, public/owner/unauthorized response shaping, and restricted match indications.
- Claim creation, immutable question snapshot, persisted verification attempts, conversation access, and unrelated-user denial.
- Main Admin Local Admin assignment, audit record, and role authorization.
- Real transaction rollback when the audit write is forced to fail, duplicate recovery creation, concurrent validation, OTP replay, expiry, custody update ordering, cross-purpose OTP rejection, and Local Admin revocation between initial authorization and transactional commit.
- Concurrent shared rate-limit requests.

It uses Express HTTP requests and real Mongoose models against a dedicated database; controller-stub tests remain under [test/](../test). The suite is not a substitute for hosted Atlas, ImageKit, or Gemini testing.

## Security findings

### Critical

- **Release gate: real database and browser integration are not verified until the replica-set and Chromium suites have actually run.** This is an environment/verification gap, not a claim that the tests passed. No production traffic should be enabled based on unit tests alone.

### High

- **Private image delivery depends on ImageKit settings.** Found uploads use private-file mode and found-report DTOs expose no raw found URL. Finder-authorized report responses get a signed URL with a 60–900 second bounded lifetime and `private, no-store` response caching. The ImageKit account must enforce signed URLs for delivery; unsigned-URL denial cannot be confirmed without that account.
- **Database-backed sensitive actions need an available MongoDB replica set.** OTP/recovery/audit actions use transactions. The distributed limiter also fails closed with 503 when its shared MongoDB bucket store is unavailable. Production MongoDB availability and retry behavior need deployment monitoring.
- **Backups, restore, alerting, and deployment rollback remain unverified operational controls.** Complete the manual checklist below before launch.

### Medium

- JWTs are stored in browser `localStorage`, and the current UI logout helper only removes the local token; there is no server-side token revocation endpoint. A stolen token remains valid until its one-day expiry. The middleware now loads the account's current role on every protected request, so role changes and deleted accounts take effect immediately. Adopt an HttpOnly secure-cookie/session design or a revocation mechanism as a separately reviewed change.
- The dashboard currently renders hard-coded sample counts and recent reports; the notification control is visual only. Notifications are not implemented. Do not use those dashboard values for operational decisions.
- The FastAPI image-analysis endpoint can analyze a validated image, but report creation currently calls it only for validation. Matching uses text and the existing safe fallback; image similarity/AI observations are not part of the live matching path.
- General report edit/close/delete endpoints and a server-side logout endpoint are not present. Current report operations include create/list/read plus dedicated question/tier actions.
- No live ImageKit upload, signed-CDN access, Gemini API, full ownership/recovery browser journey, or real production CORS/TLS test was run in this environment.

### Low

- The existing frontend README is still the generic Vite template. Phase 8 setup and operations live in this document and [database/README.md](../../database/README.md).
- MongoDB TTL deletion is asynchronous; rate-limit correctness relies on distinct fixed-window keys, not immediate TTL deletion.

## Implemented security controls

- Protected requests resolve the current account and role from MongoDB instead of trusting the potentially stale role embedded in a signed JWT.
- Shared fixed-window rate limits use HMAC-hashed client/identity keys and atomic MongoDB upserts for authentication, report creation, AI-backed match lookup, claim initiation/verification, and recovery OTP actions. Production requires a dedicated rate-limit HMAC secret distinct from the JWT secret. Configure the exact proxy hop count with `TRUST_PROXY` so Express does not trust arbitrary forwarded IP headers.
- Production startup validates required secrets, distinct signing keys, production MongoDB target, HTTPS ImageKit endpoint, exact HTTPS CORS origins, and proxy configuration. `/api/health` is a liveness check; `/api/ready` verifies the database connection.
- Image bytes are checked against the declared MIME type in Express and then decoded by Pillow in FastAPI. JPEG, PNG, and WebP are allowed; file size is capped at 5 MiB; the default maximum is 25 million pixels. Validation is internal-token protected, bounded by an HTTP timeout, and happens before ImageKit storage. Pillow's `verify()` and a full decode reject malformed/truncated content.
- Gemini calls have an 8-second configurable SDK timeout. AI response failures return safe service errors; text matching retains its existing fallback.
- Actual `.env` files and `.env.*` local variants are ignored, while example templates remain trackable. The production examples contain placeholders only.

ImageKit signed URL behavior depends on ImageKit's signed-delivery settings. See [ImageKit signed URL security](https://imagekit.io/docs/media-delivery-basic-security) and the [Node SDK URL generation docs](https://github.com/imagekit-developer/imagekit-nodejs#url-generation). The SDK supports signed URLs with expiration; enable signed-URL enforcement in the ImageKit dashboard and test an unsigned request returns 401 before launch.

## Production templates and checklist

Templates contain placeholders only: [backend/.env.production.example](../.env.production.example), [ai-service/.env.production.example](../../ai-service/.env.production.example), and [frontend/.env.production.example](../../frontend/.env.production.example). Store real values in the hosting secret manager. Never deploy by copying template placeholders as-is.

Before release:

- [ ] Use a production Atlas replica set with TLS, least-privilege DB user, IP/network allowlisting, backups enabled, and a tested restore to a separate cluster/database.
- [ ] Store `JWT_SECRET`, `RATE_LIMIT_HASH_SECRET`, `AI_SERVICE_TOKEN`, Gemini, MongoDB, and ImageKit secrets in a secret manager. Keep the rate-limit and JWT secrets different. Rotate by issuing replacement secrets, deploying both AI-service/backend token values in a coordinated change, then revoking old values. Rotating the JWT secret invalidates active sessions.
- [ ] Configure the frontend on HTTPS, `VITE_API_BASE_URL` to the HTTPS API, and `CORS_ORIGINS` to exact HTTPS origins only. Terminate TLS at a trusted proxy and set `TRUST_PROXY` to the actual hop count.
- [ ] Keep FastAPI on a private service network, require `AI_SERVICE_TOKEN`, set Gemini timeout/image limits, and verify network policy prevents public access to internal routes.
- [ ] Keep found ImageKit files private, enable signed URL enforcement for all private image requests, confirm unsigned URLs fail, and check the short expiry and cache headers.
- [ ] Tune all `*_RATE_LIMIT_*` settings against real user traffic and MongoDB capacity. Alert on 429/503 rates and rate-limit collection/index failures.
- [ ] Confirm MongoDB indexes (unique claim/candidate keys, active recovery key, report/Local Admin lookup, rate buckets, TTL expiry) are built before enabling traffic. Check deployment startup logs for index failures.
- [ ] Add centralized error monitoring, liveness/readiness probes, dependency health alerts, audit-log retention, and log redaction. Do not log passwords, OTPs, answer text/verifiers, signed URLs, AI prompts, or raw request headers.
- [ ] Document backup frequency, retention, RPO/RTO, and restore owner. Perform a restore drill before launch; a configured backup without a restore test is not verified.
- [ ] Deploy immutable frontend/backend/AI image versions. Keep the previous release available for rollback, use backward-compatible database changes, and define how to disable recovery safely if a release must be rolled back.
- [ ] Run the test commands below against a fresh test replica set and a staging environment using dedicated ImageKit/Gemini credentials before production rollout.

## Test execution report

Run from the repository root unless noted:

| Command | Expected/recorded outcome in this workspace |
| --- | --- |
| `cd backend; npm.cmd test` | **Passed: 50/50** unit and HTTP contract tests. |
| `cd backend; npm.cmd run test:integration` | **Blocked unless** `backend/.env.test` points to an available `_test` replica set. The runner refuses other names. |
| `cd ai-service; ..\venv\Scripts\python.exe -m unittest discover -s tests -v` | **Passed: 7/7** AI auth, matching schema, and image decoding tests. |
| `cd frontend; npm.cmd run lint` | **Passed** ESLint. |
| `cd frontend; npm.cmd run build` | **Passed** Vite production bundle (2,064 modules). |
| Backend `node --check` sweep | **Passed: 50 JS files** (48 backend files and 2 browser-test files; legacy ESM file checked with module parser). |
| `cd frontend; npx.cmd playwright test --list` | **Passed discovery:** 1 browser journey found. |
| `cd frontend; npm.cmd run test:e2e` | **Not run:** preflight stopped because `MONGODB_TEST_URI` is not configured; no database was changed. |
| `git diff --check` and `git diff --cached --check` | **Passed:** no whitespace errors (Git printed only line-ending notices). |
| `npm.cmd audit --audit-level=moderate` in backend | **Passed:** 0 vulnerabilities. |
| `npm.cmd audit --audit-level=moderate` in frontend | **Passed:** 0 vulnerabilities. |

Results in this workspace: backend unit and HTTP contract tests (50/50), AI-service tests (7/7), frontend lint/build, JavaScript syntax checks (50 files), Playwright test discovery, and backend/frontend online npm advisory audits (0 vulnerabilities each) were executed. The real MongoDB integration suite and browser journey could not run because this environment has no MongoDB daemon, Docker, reachable port 27017, or `MONGODB_TEST_URI`; their runners fail closed before touching any database. Replica-set integration, browser journey, and live ImageKit/Gemini checks are not counted as passed unless they report actual passing results.

## Phase 9 readiness

Not genuinely ready for Phase 9 product/UI work that depends on validated real journeys until the local MongoDB replica-set suite and Playwright smoke suite pass, ImageKit signed-delivery enforcement is confirmed, and the remaining operational checklist is assigned. UI redesign remains out of scope for this phase.
