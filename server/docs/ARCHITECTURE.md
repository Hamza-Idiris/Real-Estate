# Architecture

## Layout
`src/modules/<domain>/{model,service,routes}.ts` · `src/domain/*` pure business rules (permissions, state machines, rent schedule, mock provider) with unit tests · `src/middleware` auth/company context/errors · `src/utils` helpers · `src/jobs` idempotent housekeeping.

## Multi-tenancy & authorization
1. `requireAuth` → user from JWT (user re-loaded; suspended users rejected).
2. `companyCtx` → resolves the caller's **active Membership** for `:companyId`. Non-members get 404. The id in the URL is never proof of access.
3. `requirePerm(...)` → effective permissions = `ROLE_CEILING[role] ∩ membership.permissions`, active membership only. Owners have all.
4. Scope: `membership.scope = all | assigned`. Assigned staff only reach properties in their `propertyIds`, `branchIds`, or `assignedStaffIds`. Every child record (booking, application, tenancy, invoice, maintenance, expense) is filtered via `scopeFilter(req)` — out-of-scope records return 404 (no IDOR signal).
5. Tenants: access derives from `tenantId == token user` on the Tenancy/Invoice. Maintenance `propertyId` is **derived from the caller's own active tenancy**, never accepted from the client.
6. Platform admin: separate `platformRole`; routes expose counts/status only; all mutations need a reason + audit.

### Permission matrix (ceiling per role; owners can reduce, never exceed)
| Permission | owner | manager | agent | accountant |
|-|-|-|-|-|
| company.update, staff.manage, payment.reverse | ✔ | – | – | – |
| branch.manage, audit.read, property.create/archive, lease.manage, maintenance.assign | ✔ | ✔ | – | – |
| expense.approve | ✔ | ✔ | – | – |
| property.read/update, booking.manage, application.review, maintenance.read/manage | ✔ | ✔ | ✔ | read only |
| tenant.read, invoice.read | ✔ | ✔ | ✔ | ✔ |
| invoice.manage, payment.record_mock, expense.read/manage, report.read | ✔ | ✔ | – | ✔ |
| (agent also holds invoice.read; accountant holds property.read, tenant.read) | | | | |
(Authoritative source: `src/domain/permissions.ts`.)

## Data model (MongoDB)
Money = integer minor units + ISO currency (2-decimal currencies only). Timestamps on all docs (UTC).
| Collection | Key fields | Key indexes / constraints | Deletion policy |
|-|-|-|-|
| users | email, passwordHash(bcrypt-12, select:false), platformRole, status | unique email | suspend, never delete |
| refreshsessions | familyId, tokenHash | unique tokenHash; TTL | purged after expiry |
| companies / branches | settings, timezone, currency | unique slug; unique (company,name) | suspend / archive |
| memberships | role, permissions, scope, branchIds, propertyIds, status | unique (company,user) partial; unique (company,email) | deactivate |
| properties (media embedded) | listingStatus, occupancyStatus, priceMinor, location(address private) | unique reference; (company,status); public search compound; text index | archive only; blocked if lease exists |
| viewingbookings | requestedSlots, confirmedStart, assignedStaffId, isActive | **unique (staff,confirmedStart) & (property,confirmedStart) where confirmed**; unique (property,customer) where active | kept |
| rentalapplications | form(minimal PII), infoRequests, documents(private) | unique (property,applicant) where open | kept |
| tenancies (contract snapshot embedded) | terms, acceptance, status | **unique (propertyId) where status=active**; unique applicationId | kept (history) |
| invoices | key, totalMinor, paidMinor, status(no stored "overdue") | unique (tenancy,key) = idempotent generation; (company,dueDate) | void, never delete |
| paymentattempts | scenario, status, idempotencyKey | unique (invoice,idempotencyKey) | kept |
| paymenttransactions | type payment/reversal, applied, invoiceType snapshot | **unique attemptId**, **unique reversesTransactionId** | immutable ledger |
| expenses | category, status, receiptKey(private) | unique maintenanceRequestId (mirror) | reject, never delete |
| maintenancerequests | priority, status, comments(internal flag), costs | (company,status,priority) | kept |
| notifications | userId, readAt | (user,readAt,createdAt) | — |
| auditlogs | actor, action, entity, outcome, scrubbed meta | (company,createdAt) | append-only (no update/delete routes) |

### Status transitions
Defined once in `src/domain/transitions.ts` and enforced with compare-and-set updates (`findOneAndUpdate({_id, status: from})`) so concurrent edits yield `409 STALE_STATE`.

## Consistency
* **Transactions**: `USE_TRANSACTIONS=true` (replica set) wraps tenancy activation (property lock bump, renewal swap, invoice generation, occupancy) and payment completion.
* **Without transactions** safety still comes from: DB unique indexes (one active tenancy per property, one transaction per attempt, one reversal per transaction, unique booking slots), atomic single-doc claims (`applied` flag; invoice update with `$expr` no-overpay guard), and idempotent invoice keys. A crash mid-activation in non-transaction mode can leave a lease active with partially generated invoices; re-running is safe for invoices but you should run production with a replica set.
* One active tenancy per property at a time → activate a lease at move-in, not months ahead.
* Slot grid (default 30 min) makes "overlap" equal "same start", so a unique index can enforce it.

## Money & reporting basis (also returned in every report response)
* Expected rent = accrual (rent invoices due in period, non-void). Collected = cash basis net of reversals, **MOCK only**. Overdue derived at read time. Expenses = approved only. **Deposits are liabilities, never income.** Amounts grouped per currency; no FX conversion.

## Security summary
bcrypt cost 12 + lockout (5 fails/15 min) + generic login errors + constant-time-ish dummy compare · rotating refresh tokens with reuse detection · helmet, strict CORS allowlist, 100 kb JSON limit, global + per-route rate limits · every body/query/param validated by **strict** Zod schemas (blocks mass assignment and `$`-operator injection) · allow-listed sorts/filters · uploads: 5 MB, magic-byte sniffing (jpg/png/webp/pdf only), server-generated names, private files only via 10-min HMAC links with `no-store` + sandbox CSP · audit log of sensitive/financial/admin actions and denied attempts, secrets scrubbed · CSV export formula-injection guard · no stack traces in responses.

## Performance
Server pagination everywhere, lean queries + projections, indexes per query pattern, public listing `Cache-Control: public, max-age=30` (availability is **re-checked server-side** on booking/application/activation), static listing images cached 7 days. Acceptance targets to measure (not benchmarked here): p95 < 300 ms for public search at 10k listings on a single small instance; payment completion p95 < 500 ms.
