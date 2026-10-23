# EstateFlow — Web app

React 18 · TypeScript · Tailwind · React Router · TanStack Query · React Hook Form + Zod · Lucide. Talks to the EstateFlow API (`../server`).

> Payments are **simulated** (every screen says "Demo payment — no real money transferred"). Notifications are **in-app only**.

## Run
```bash
cp .env.example .env        # VITE_API_URL=http://localhost:4000
npm install
npm run dev                 # http://localhost:5173  (API must allow this origin in CORS_ORIGINS)
npm run build               # type-checks, then builds to dist/
npm test                    # 44 tests (API client, UI components, WCAG contrast)
```
Demo logins (after `npm run seed` in the server, password `Demo#12345678`): `owner@`, `agent@`, `accountant@`, `customer@`, `admin@` `estateflow.demo`.

## Areas (route groups)
| Area | Routes | Guard |
|-|-|-|
| Public marketplace | `/`, `/properties` (URL-driven filters), `/properties/:ref` | none |
| Auth | `/login`, `/register` | none |
| Account | `/account` (viewings, applications, profile/privacy), `/notifications` | signed in |
| Tenant portal | `/tenant` home, invoices (+demo pay, receipts), lease (review/accept), maintenance (+emergency) | signed in; data is scoped by the API to *your* tenancies |
| Company dashboard | `/dashboard` overview, properties (CRUD, media, publish, tabs), viewings (list/calendar), applications, leases, invoices, expenses, maintenance, reports (+CSV), staff, audit, settings | membership; nav and actions follow the server-issued permission list |
| Platform admin | `/admin` stats, companies, users | `platformRole = super_admin` |

## How it handles the brief's UX rules
Every data screen has loading skeletons, empty states, error + retry (no retry for 403/404), validation messages tied to inputs (`aria-invalid`/`aria-describedby`), destructive confirmations (archive, terminate, reverse, cancel), toast feedback, skip link, landmarks, visible focus rings, `prefers-reduced-motion`, responsive layouts with mobile drawers/bottom-sheet modals, tabular numerals for money. Search filters live in the URL (shareable); keyword input is debounced; obsolete requests are cancelled via `AbortSignal`; routes are code-split. Disabled actions are used where a state forbids them; nothing is a dead button.

## Security notes (read these)
* The UI **never decides** access: permissions only hide/show controls; the API re-checks everything (company isolation, scope, tenancy ownership, payment outcome). Do not treat `can()` as a security boundary.
* Access token is kept **in memory**; the **refresh token is in `localStorage`** because the API issues bearer refresh tokens. That is exposed to XSS. The app sets no `dangerouslySetInnerHTML`, but for production hardening move the refresh token to an `httpOnly; Secure; SameSite` cookie (API change) and add a CSP at your host.
* No secrets belong in `VITE_*` variables.
* Map uses an OpenStreetMap iframe (only when a listing has coordinates). If you set a strict CSP, allow `frame-src https://www.openstreetmap.org`.

## Testing — honest status
Ran and passing: TypeScript strict type-check, production build, 44 tests (API client incl. single-flight token refresh and retry, error mapping, money/timezone formatting, Modal/Confirm/DataTable/Pagination/Badge/BarChart behaviour, login validation and failure states, 26 WCAG contrast assertions on the design tokens).
**Not done:** the app has not been exercised in a real browser against a live API in the build environment (no MongoDB/browser available), so visual polish, responsive breakpoints and end-to-end flows need your manual pass. No Playwright/E2E suite is included yet.

## Known gaps
Viewing detail deep-links open the list (no per-booking page) · no PDF export · no image cropping/compression in the browser · invitation acceptance is a manual token paste (no email delivery) · staff property-level assignment exists per property (Staff tab) but the staff editor only sets branches · English only · no offline support.
