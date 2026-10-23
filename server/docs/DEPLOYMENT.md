# Deployment

## Environment variables (see `.env.example`)
Required (process exits with a clear message if missing/invalid): `MONGO_URI`, `JWT_ACCESS_SECRET` (≥32), `FILE_SIGNING_SECRET` (≥32).
Optional: `PORT, NODE_ENV, CORS_ORIGINS (comma list, exact origins), ACCESS_TOKEN_TTL_MIN, REFRESH_TOKEN_TTL_DAYS, USE_TRANSACTIONS, UPLOAD_DIR, PUBLIC_API_URL (used in image/file links), VIEWING_SLOT_MINUTES, TRUST_PROXY (true behind a proxy/LB so rate limits see client IPs), LOG_LEVEL, RUN_JOBS`.
Secrets stay on the server; never put them in frontend env.

## Production checklist
1. MongoDB **replica set** (Atlas or self-hosted) → `USE_TRANSACTIONS=true`.
2. `npm ci && npm run build && npm run indexes && npm start` (run `indexes` once per release).
3. TLS terminates at the proxy; set `TRUST_PROXY=true`, `PUBLIC_API_URL=https://api.yourdomain`, `CORS_ORIGINS=https://app.yourdomain,...`.
4. `UPLOAD_DIR` must be a persistent volume (or swap the storage adapter for S3/GCS before scaling past one instance). Serve `/media` through a CDN if desired. `private/` files are never served statically.
5. Run exactly one instance with `RUN_JOBS=true`, or move `runJobs()` to a cron/worker.
6. Create the first platform admin by promoting a registered user: `db.users.updateOne({email:"you@x"},{$set:{platformRole:"super_admin"}})`. Do **not** run `npm run seed` in production (it refuses).
7. Health: `GET /health` (liveness), `GET /health/ready` (DB readiness).

## Backup & recovery
Enable continuous/PITR backups (Atlas) or nightly `mongodump --uri=...` + archive; back up `UPLOAD_DIR`. Test restores quarterly. Financial collections (`invoices`, `paymenttransactions`, `auditlogs`) are append-style; never hand-edit them.

## Troubleshooting
* Process exits on boot → read the listed missing env vars.
* `Transaction numbers are only allowed on a replica set` → set `USE_TRANSACTIONS=false` or run a replica set.
* CORS failures → origin must match `CORS_ORIGINS` exactly (scheme+host+port).
* 429 behind a proxy for everyone → set `TRUST_PROXY=true`.
* `E11000`/409 SLOT_CONFLICT → expected: slot already taken; indexes missing → run `npm run indexes`.
* Image links point to localhost → set `PUBLIC_API_URL`.

## Docker (written, not executed in the build environment)
`docker-compose.yml` (repo root) starts a MongoDB **replica set**, the API (non-root, health-checked, uploads volume) and the web app behind nginx with a strict CSP (`API_ORIGIN` is substituted at container start).
```bash
export JWT_ACCESS_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")
export FILE_SIGNING_SECRET=$(node -e "console.log(require('crypto').randomBytes(48).toString('base64url'))")
docker compose up --build        # web http://localhost:8080 · API http://localhost:4000
```
Compose defaults are for local/staging. For production: terminate TLS in front (enable the HSTS line in `web/nginx.conf.template`), set `CORS_ORIGINS`/`PUBLIC_API_URL` to your real HTTPS origins, use a managed MongoDB with backups, replace the `uploads` volume with object storage, and never run `npm run seed`.
