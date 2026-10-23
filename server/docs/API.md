# EstateFlow API v1

Base: `/api/v1`. JSON. Success: `{ data, meta? }`. Error: `{ error: { code, message, details?, requestId } }` (never stack traces).
Auth: `Authorization: Bearer <accessToken>` (15 min). Refresh tokens rotate; replaying a used one revokes the whole session family.
Money: **integer minor units** + `currency`. Dates: ISO-8601 UTC; render in `company.timezone`.
Pagination: `?page=&limit=` (limit ≤ 100) → `meta {page,limit,total,pages}`.
Status codes: 400 validation · 401 unauthenticated · 403 lacks permission · 404 not found **or not yours** · 409 state/uniqueness conflict · 413 file too large · 429 rate-limited.
Common codes: `VALIDATION_ERROR, UNAUTHORIZED, FORBIDDEN, NOT_FOUND, INVALID_TRANSITION, STALE_STATE, SLOT_CONFLICT, NOT_AVAILABLE, TENANCY_OVERLAP, DEPOSIT_REQUIRED, INVOICE_BALANCE_CHANGED, IDEMPOTENCY_KEY_REQUIRED, ALREADY_REVERSED, UNSUPPORTED_FILE_TYPE`.

## Public
| | |
|-|-|
| GET `/meta` | payment env = MOCK, in-app-only notices, emergency disclaimer |
| GET `/public/properties` | filters: `q country city district type transaction minPrice maxPrice(minor) currency bedrooms bathrooms furnished availability amenities(csv) sort page limit` · cacheable |
| GET `/public/properties/facets` · `/:idOrRef` · `/:idOrRef/similar` | |

## Auth & profile
POST `/auth/register|login|refresh|logout|forgot-password|reset-password` · POST `/auth/change-password` · GET/PATCH `/me/profile` · GET `/me/data-export` · GET `/me/companies`

## Customer & tenant (`/me/...`, identity from token only)
* `/me/bookings` POST (propertyId, slots[1-3], contact) · GET · GET/:id · POST/:id/respond `{action: accept_alternative|cancel}`
* `/me/applications` POST · GET · GET/:id · PATCH/:id (draft) · POST/:id/submit|withdraw|respond · POST/:id/documents (multipart `file`, pdf/jpg/png/webp ≤5MB)
* `/me/tenancies` GET · `/home` · GET/:id · POST/:id/accept
* `/me/invoices` GET · GET/:id · POST/:id/payments (**`Idempotency-Key` header required**; body `{amountMinor?, scenario: success|failure|pending}`)
* `/me/payments` GET history · GET `/attempts/:id` · POST `/attempts/:id/complete` (**no status in body — backend decides**) · GET `/transactions/:id/receipt` (watermarked SIMULATED)
* `/me/maintenance` POST (tenancyId, category, title, description, priority) · GET · GET/:id · POST/:id/comments|attachments|reopen
* `/notifications` GET (`unread=true`) · GET `/unread-count` · POST `/:id/read` · POST `/read-all`
* `/invitations/accept` · `/companies` POST (create company → caller becomes owner)

## Company workspace `/companies/:companyId/...` (membership resolved server-side)
Permission in brackets. Property-scoped staff only see records for properties they are assigned to.
* `/` GET · PATCH [company.update]; `/branches` GET, POST/PATCH [branch.manage]
* `/staff/assignable` GET (id, name, role of active staff; any of maintenance.assign / booking.manage / property.update / staff.manage) — used by assignee dropdowns
* `/staff` GET, POST `/invite`, PATCH `/:id` [staff.manage] (invite token returned once; no email provider)
* `/audit` GET [audit.read]
* `/properties` GET [property.read] · POST [property.create] · GET/PATCH/:id · POST/:id/publish|unpublish|occupancy [property.update] · POST/:id/archive [property.archive] · PUT/:id/staff · POST/PUT/DELETE `/:id/media`
* `/bookings` GET (`view=calendar` for range view) · GET/:id · POST/:id/decision `{action: confirm|propose|reject|cancel|complete|no_show}` [booking.manage]
* `/applications` GET · GET/:id · POST/:id/status [application.review]
* `/tenancies` GET [tenant.read] · POST (from approved application) · PATCH/:id/terms · POST/:id/company-accept|activate|terminate|renew [lease.manage]
* `/invoices` GET [invoice.read] · `/transactions` GET · POST (ad-hoc fee) · POST/:id/void [invoice.manage] · POST/:id/mock-payments [payment.record_mock] · POST `/transactions/:id/reverse` [payment.reverse]
* `/expenses` GET [expense.read] · POST/PATCH/:id/receipt [expense.manage] · POST/:id/decision [expense.approve]
* `/maintenance` GET [maintenance.read] · POST/:id/assign [maintenance.assign] · POST/:id/status|comments|attachments, PATCH/:id/costs [maintenance.manage (+expense.manage)]
* `/reports/overview|financial` · `/reports/export/invoices.csv|expenses.csv` [report.read]

## Platform admin `/admin/...` (super_admin only; counts and account status — no tenant/company private data)
GET `/stats|companies|users` · PATCH `/companies/:id/status`, `/users/:id/status` (reason required, audited) · POST `/properties/:id/verify`
