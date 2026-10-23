# EstateFlow — Backend API (Phases 1–5)

Node.js · Express · TypeScript · MongoDB (Mongoose) · Zod. One API serves the public marketplace, the company dashboard, the tenant portal and (later) the Flutter app.

> **Payments are SIMULATED.** Every payment/receipt is labelled `MOCK` — "Demo payment — no real money transferred". No gateway, card data, or transfers exist.
> **Notifications are in-app only.** No email/push provider is configured; nothing claims external delivery.

## Quick start
```bash
cp .env.example .env            # set JWT_ACCESS_SECRET and FILE_SIGNING_SECRET (>=32 chars)
npm install
# MongoDB must be running. For transactions use a replica set (see below) and set USE_TRANSACTIONS=true
npm run seed                    # fictional demo data + syncs indexes
npm run dev                     # http://localhost:4000  (GET /health, /health/ready)
```
Demo accounts (password `Demo#12345678`): `admin@` (platform admin), `owner@`, `agent@`, `accountant@`, `customer@` `estateflow.demo`.
Properties seed as drafts: upload an image, then publish.

Local replica set (Docker): `docker run -d --name mongo -p 27017:27017 mongo:7 --replSet rs0 && docker exec mongo mongosh --eval 'rs.initiate()'`
then `MONGO_URI=mongodb://127.0.0.1:27017/estateflow?replicaSet=rs0`.

## Scripts
`dev` · `build` · `start` · `typecheck` · `test` · `seed` · `indexes` (sync indexes in prod deployments)

## Testing — honest status
* `npm test` runs **24 unit tests + 6 DB-less HTTP smoke tests** (permissions, state machines, rent schedule, overdue logic, mock provider, slot rules, CSV injection, signed URLs, magic-byte sniffing, validation/NoSQL-injection, CORS, auth gates). These were executed and pass.
* `tests/integration.test.ts` contains the end-to-end scenarios you specified (Company A→B denial, viewing→application→lease→tenancy→tenant isolation, mock payment idempotency under concurrency, reversal). **They were written but NOT executed** in the build environment (no MongoDB available). Run them with a replica set:
  `MONGO_TEST_URI="mongodb://127.0.0.1:27017/estateflow_test?replicaSet=rs0" MONGO_TEST_TX=true npm test` (**wipes that database**). Treat any failures there as real bugs to fix.

## Docs
* `docs/API.md` — endpoints, auth, errors
* `docs/ARCHITECTURE.md` — data model, indexes, permission matrix, consistency/transactions, security, reporting basis
* `docs/DEPLOYMENT.md` — env vars, production checklist, backups, troubleshooting

## Not implemented yet (by design, not hidden)
Flutter app and React web (Phases 6–7) · PDF export (CSV exists) · email/push delivery · real payment provider · image resizing/WebP conversion (needs `sharp`) · antivirus scanning of uploads · S3/GCS storage adapter (local-disk adapter ships; interface is 4 functions in `modules/files/storage.ts`) · scheduled job runner is an in-process hourly timer (use a real scheduler/leader election when running multiple instances; jobs are idempotent).
