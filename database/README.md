# MongoDB development options

The app's development backend can use the existing Atlas cluster with an isolated `findback_ai_dev` database. The development environment is stored in the ignored `backend/.env.development`; its URI is derived from the existing `backend/.env` URI by keeping the same Atlas host, credentials, and options while changing only the database path. The backend validates this relationship and the selected database name before connecting. If validation or the Atlas connection fails, startup stops; it does not fall back to `backend/.env`.

The optional Compose stack below is for local development or integration testing when a local MongoDB is desired. It binds MongoDB to loopback, uses a named local volume, and has no authentication. Do not expose it to a network or use it in production. A single-node replica set supports transaction tests but does not provide production availability.

From the repository root, start MongoDB and initialize `rs0`:

```powershell
docker compose -f database/docker-compose.yml up -d mongodb
docker compose -f database/docker-compose.yml run --rm replica-init
docker compose -f database/docker-compose.yml exec mongodb mongosh --quiet --eval "db.hello().isWritablePrimary"
```

The last command should print `true`. The replica advertises `localhost:27017` so host-run application processes can connect through the loopback port mapping.

For Atlas development, the backend's `npm run dev` command explicitly loads `backend/.env.development`. It requires that URI to select `findback_ai_dev` on the same Atlas host with the same credentials and query options as `backend/.env`, and allows only the Vite origin `http://localhost:5173`. It reads the existing URI only to validate cluster identity; it never loads it as a fallback. The frontend uses the ignored `frontend/.env.development` file to set `VITE_API_BASE_URL=http://localhost:4000/api`.

## Start local authentication development

Prerequisites: Node.js 20.19 or newer, the backend/frontend npm dependencies, an Atlas network access entry for this machine, and a database user permitted to read/write `findback_ai_dev`. Avoid broad network access rules. The repository's ignored local environment files contain unique development-only auth secrets; the Atlas URI in `backend/.env.development` contains the same secret connection details as `backend/.env`, so neither file should be committed or printed.

Start the backend in one PowerShell terminal:

```powershell
Set-Location backend
npm.cmd run dev
```

Start Vite in a second terminal:

```powershell
Set-Location frontend
npm.cmd run dev
```

The backend health endpoint is `http://localhost:4000/api/health`; its readiness endpoint is `http://localhost:4000/api/ready`. The frontend is `http://localhost:5173`. The URI is statically checked to target `findback_ai_dev` before connection. Atlas creates that database when the first collection is written; no database, account, seed, or migration operation is performed by this setup. Use an Atlas database role scoped to `findback_ai_dev` if the existing database user's permissions do not already include it.

To use the optional local Compose MongoDB instead of Atlas, set up a separate local-only environment and URI; the Atlas development launcher described above will reject local MongoDB. Do not change `backend/.env` to switch databases.

For integration tests, copy `backend/.env.test.example` to `backend/.env.test`; it uses only `findback_test`. Test runners accept local loopback MongoDB by default and require the database name to end exactly in `_test`; the integration runner checks the replica-set handshake before it drops that database. Remote Atlas testing is opt-in and must use a dedicated test cluster/host, never production: set `MONGODB_TEST_ALLOW_REMOTE=true` and `MONGODB_TEST_HOST` to the exact hostname in the URI. The guard also compares the test host with `MONGODB_URI` in `backend/.env` and refuses a match. A separate Atlas cluster is still preferable because host aliases can defeat hostname comparison.

```powershell
Copy-Item backend/.env.test.example backend/.env.test
Set-Location backend
npm.cmd run test:integration
```

To erase the local development and test data, run `docker compose -f database/docker-compose.yml down -v` only when you intentionally want to remove the local MongoDB volume.
