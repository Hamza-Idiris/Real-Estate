# Security review (Phase 7)

Scope: API (`server`), web (`web`), mobile (`mobile`), deployment files. **Not** a penetration test and **not** an external audit — do both before real customers.

## What is enforced, and where it is tested
| Control | Where | Evidence |
|-|-|-|
| Every non-public API route requires auth; the public set is an explicit allow-list | `app.ts` | `server/tests/security-inventory.test.ts` walks the live router (117 routes) and fails on any new unauthenticated route |
| Every company route resolves the caller's *membership* (never trusts the URL company id) and has a permission gate; mutating routes need ≥1 permission | `middleware/auth.ts` | inventory test |
| Platform-admin routes require `super_admin`; they expose counts/status only | `modules/admin` | inventory test |
| Path params are validated before DB use; bodies/queries use strict Zod schemas (mass-assignment and `$operator` injection rejected) | `utils/http.ts` | inventory test, `validation.test.ts`, HTTP smoke tests |
| Out-of-scope records return 404 (no IDOR signal); staff scope by branch/property/assignment | `companies/scope.ts` | covered by integration scenarios (**written, not executed**) |
| Tenant access derives from the token (`tenantId`), maintenance property derives from the tenant's own active tenancy | `tenancies`, `maintenance` | integration scenarios (**not executed**) |
| Payments: backend decides outcome; unique `attemptId`/`reversesTransactionId`; idempotency keys; no overpay guard; MOCK-only | `payments/service.ts` | unit tests for provider; concurrency scenario **not executed** |
| Passwords bcrypt-12, lockout (5 fails → 15 min), generic login errors, rotating refresh tokens with reuse detection, reset flow revokes sessions | `auth/service.ts` | unit/validation tests; flows need DB |
| Uploads: 5 MB, magic-byte sniffing (jpg/png/webp/pdf; SVG rejected), server-generated names, private files via 10-min HMAC links, `no-store`, sandbox CSP | `files/*` | unit tests for sniff/signed URL; HTTP smoke (forged link → 404) |
| CORS allow-list, helmet, rate limits (global, auth, payments), 100 kb JSON limit, no stack traces | `app.ts`, `middleware/error.ts` | HTTP smoke tests |
| Audit log of sensitive/financial/admin actions + denied attempts; secrets scrubbed; append-only | `audit/*` | unit test for scrub |
| CSV export formula-injection guard | `utils/csv.ts` | unit test |
| Web CSP/headers (nginx), no `dangerouslySetInnerHTML`, token handling | `web/nginx.conf.template` | review only (**CSP not exercised in a browser**) |

## Known risks / decisions you must make
1. **Refresh token storage (web):** in `localStorage` → XSS-exposed. Move to an `httpOnly; Secure; SameSite=Strict` cookie before launch (needs API changes: cookie issue/rotate/CSRF protection). Mobile uses the OS keystore.
2. **Access tokens live 15 minutes and are not revocable earlier** (suspension/password change blocks refresh and `requireAuth` re-checks user status each request, so suspended users are cut off immediately; a stolen token of an *active* user works until expiry).
3. **No MFA**, no email verification, no email delivery: password reset token is only logged in non-production; invitations return a one-time token to the inviter. Add an email provider + verification before opening registration publicly.
4. **Registration reveals whether an email exists** (`EMAIL_TAKEN`). Acceptable for UX; remove if enumeration matters to you.
5. **Rate limits are per-IP, in-memory**: behind a proxy set `TRUST_PROXY=true`; with multiple API instances use a shared store (Redis) for limits.
6. **Uploads are not virus-scanned** and images are not re-encoded (EXIF kept). Add scanning/re-encoding (e.g. `sharp`) and a storage adapter with private buckets for multi-instance deployments.
7. **Non-transaction mode can leave partial state** on a crash mid-activation (see `ARCHITECTURE.md`). Run MongoDB as a replica set with `USE_TRANSACTIONS=true` in production.
8. **Dependency audit:** run `npm audit` (CI does, at `high`). Dependencies were not audited in the build sandbox.
9. **Legal/privacy pages are templates.** Retention: ended leases/invoices/audit logs are kept indefinitely by design; define retention/deletion rules and a data-subject-request process (data export exists for profile/bookings/applications only).
10. **PII in logs:** request logs include IP and path, not bodies; `Authorization` and password-like fields are redacted. Review your log retention.
