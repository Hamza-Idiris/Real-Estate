# Testing — what ran, what did not

| Suite | Command | Status in the build environment |
|-|-|-|
| Server unit + validation + HTTP smoke + **security route inventory** | `cd server && npm test` | **Ran: 38 passed**, 6 skipped |
| Server integration scenarios (Company A→B isolation, viewing→application→lease→tenancy→tenant isolation, payment idempotency under concurrency, reversal) | `MONGO_TEST_URI=…replicaSet=rs0 MONGO_TEST_TX=true npm test` | **Written, NOT run** (no MongoDB). First thing to run on your machine; failures are real bugs |
| Web unit/UI + **contrast** | `cd web && npm test` | **Ran: 44 passed** |
| Web type-check + production build + bundle budget | `cd web && npm run build` | **Ran: OK** |
| Server type-check / build | `cd server && npm run typecheck && npm run build` | Type-check OK |
| Flutter analyze + tests | `cd mobile && flutter analyze && flutter test` | **NOT run** — no Flutter SDK; code never compiled |
| Docker build / compose | `docker compose up --build` | **NOT run** — no Docker |
| CI workflow | `.github/workflows/ci.yml` | Written, never executed |
| Load test | `k6 run server/scripts/loadtest.k6.js` | Written, NOT run |
| E2E browser tests (Playwright), axe, Lighthouse | — | Not included |

Never claim a green build for the NOT-run rows. Suggested order on your machine: server integration tests → web in browser against the API → Flutter analyze/test/run → docker compose → k6.
