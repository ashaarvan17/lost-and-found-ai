# Phase 7 test and deployment notes

## Isolated MongoDB integration tests

The backend unit tests use model stubs and do not connect to MongoDB. Before running database integration tests, provision a dedicated replica-set database named `findback_test` (or another name ending in `_test`) and set `MONGODB_TEST_URI` to that database. Never use a development or production URI. Transactions require a replica set or sharded cluster.

The current environment has no MongoDB daemon, Docker executable, MongoDB listener, or configured test URI, so real persistence, rollback, and transaction-retry tests have not been run here.

## Production environment

Set backend secrets outside source control: `MONGODB_URI`, a high-entropy `JWT_SECRET`, ImageKit keys, and the internal AI service token. Set `CORS_ORIGINS` to the exact HTTPS frontend origins, and set `VITE_API_BASE_URL` at frontend build time. Configure the FastAPI service with `GEMINI_API_KEY`, `GEMINI_MODEL`, and the same `AI_SERVICE_TOKEN` as the backend.

Recovery operations and their audit events run in MongoDB transactions. Verify replica-set transaction support, backups, restore procedures, index creation, and alerting in the deployment environment before enabling recovery.

## Known production controls still required

- Add distributed rate limiting for login, report creation, claims, uploads, AI calls, and recovery endpoints.
- Add production HTTPS termination and operational secret rotation.
- Complete authenticated private-image delivery and validate real image decoding/dimensions before storage.
- Add structured error monitoring and tested backup/restore objectives.
