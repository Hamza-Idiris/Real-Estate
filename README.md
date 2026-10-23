# EstateFlow

Multi-tenant real estate management + marketplace: **API** (`server/`), **web app** (`web/`), **Flutter app** (`mobile/`), deployment files and docs.

> Payments are **simulated** everywhere (explicit `MOCK` environment). Notifications are **in-app only**. See `docs/TESTING.md` for exactly what has and has not been verified.

| Folder | What | Verified here |
|-|-|-|
| `server/` | Node + Express + TypeScript + MongoDB REST API (auth, companies/staff/permissions, properties/search, viewings, applications, leases/tenancies, invoices + mock payments, expenses, maintenance, notifications, reports, audit, platform admin) | type-check ✔ · 38 tests ✔ · integration tests written, **not run** (needs MongoDB) |
| `web/` | React + TypeScript + Tailwind: marketplace, account, tenant portal, company dashboard, platform admin | type-check ✔ · 44 tests ✔ · build + bundle budget ✔ · **not exercised in a browser against a live API** |
| `mobile/` | Flutter app (discover, viewings, applications, tenant portal, alerts, profile) | **never compiled or run** (no Flutter SDK available) |
| `docker-compose.yml`, `*/Dockerfile`, `.github/workflows/ci.yml` | deployment + CI | **never executed** |
| `docs/` | `SECURITY.md`, `PERFORMANCE.md`, `ACCESSIBILITY.md`, `TESTING.md`; plus `server/docs/{API,ARCHITECTURE,DEPLOYMENT}.md` | — |

## Quick start (local)
```bash
# 1) database + API
cd server && cp .env.example .env     # set the two secrets; MongoDB must be running (replica set for transactions)
npm install && npm run seed && npm run dev          # http://localhost:4000
# 2) web
cd ../web && cp .env.example .env && npm install && npm run dev      # http://localhost:5173
# 3) mobile (after reading mobile/README.md)
cd ../mobile && flutter create --platforms=android,ios . && flutter pub get && flutter run --dart-define=API_URL=http://10.0.2.2:4000
```
Demo logins (password `Demo#12345678`): `owner@ agent@ accountant@ customer@ admin@ estateflow.demo`. Seeded properties are drafts: upload an image, then publish.
Or everything in containers: see `server/docs/DEPLOYMENT.md` (Docker section).

## First things to do on your machine (in this order)
1. Run the server **integration tests** against a MongoDB replica set (`docs/TESTING.md`). They encode your required isolation, lifecycle and idempotency scenarios; they have never executed.
2. Click through the web app against the API (viewing → application → lease → activation → tenant pays → maintenance).
3. `flutter analyze && flutter test`, fix compile issues, run on a device.
4. Work through the risk list in `docs/SECURITY.md` (refresh-token cookie, email delivery/verification, MFA, scanning of uploads, retention).

## Scope not implemented
PDF export · email/push delivery · real payment provider · image resizing · virus scanning · object-storage adapter · Playwright E2E · subscription billing for the SaaS · localisation · offline mode. All are listed again, with reasons, in the per-package READMEs.
