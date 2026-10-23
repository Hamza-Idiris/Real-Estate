# Performance (Phase 7)

**No server benchmarks were run** (no MongoDB in the build environment); numbers below are *targets to measure*, not results.

## Verified
* **Web bundle budget** (enforced by `npm run build` via `web/scripts/check-bundle.mjs`): entry JS ≤ 150 KB gzip, any lazy chunk ≤ 60 KB gzip, CSS ≤ 15 KB gzip. Current build: entry ≈ 109 KB gzip, largest lazy chunk ≈ 20 KB gzip. Workspaces (tenant/dashboard/admin) are route-split.
* Request cancellation (`AbortSignal`), 20 s timeouts, debounced search (350–450 ms), keep-previous-data on filter changes, retry only on network/5xx errors (web `main.tsx`; mobile `api_client.dart`).

## Designed in (unmeasured)
* Server pagination everywhere (limit ≤ 100); lean queries + projections; `Promise.all` for independent reads; no N+1 in list endpoints (populate/select used).
* Indexes per query pattern (see `server/docs/ARCHITECTURE.md`): public search compound index + text index, `(company,status,dueDate)` invoices, `(company,status,priority,createdAt)` maintenance, unique partial indexes that double as lookup indexes.
* Public listing responses: `Cache-Control: public, max-age=30, stale-while-revalidate=60`; listing images `max-age=7d, immutable`; web `/assets/*` immutable for a year; `index.html` `no-store`. Availability is **re-checked on the server** for bookings/applications/activation, and private/tenant data is never publicly cacheable (`no-store`/auth required).

## Acceptance criteria to measure before launch
| Scenario | Target |
|-|-|
| `GET /public/properties` (10k published listings, mixed filters, 50 VUs) | p95 < 300 ms, error rate < 1 % |
| `GET /public/properties/:ref` | p95 < 250 ms |
| Payment completion (idempotent) | p95 < 500 ms; zero duplicate transactions under 20 concurrent completes |
| Tenancy activation (12-month lease) | p95 < 1.5 s |
| Dashboard overview report (5k invoices) | p95 < 800 ms |
| Web first load, 4G throttle | LCP < 2.5 s on the search page |
How: `k6 run -e BASE=... server/scripts/loadtest.k6.js` (public browse profile, thresholds encoded); seed volume with a script; run `explain()` on the slow queries; Lighthouse CI for web.

## Likely first bottlenecks (hypotheses)
Text search + sort on large collections (consider Atlas Search); report aggregations (add pre-aggregated monthly summaries); local-disk uploads behind a single instance (move to object storage + CDN); in-memory rate limiter (move to Redis).
