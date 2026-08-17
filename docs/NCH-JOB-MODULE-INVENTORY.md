# NCH Job Module — Extraction Inventory

**Task:** CLAUDE-HH-01 · Kell Systems Consulting LLC → Harbor Haven Home Watch LLC
**SOURCE:** `jkelluniverse/Asset-Manager` (NCH Ops monorepo), branch `claude` — read-only
**TARGET:** `jkelluniverse/harborhaven` (this repo)
**Status:** Step 1 deliverable. Awaiting Jacob's go-ahead before any copying.

---

## 0. Reality check: SOURCE is not the stack the build prompt assumed

The build prompt describes SOURCE as Next.js (App Router) + Prisma. It is not. SOURCE is:

| Layer | SOURCE actual |
|---|---|
| Repo shape | pnpm workspace monorepo (`artifacts/*`, `lib/*`, `scripts`) |
| API | **Express 5** (`artifacts/api-server`), esbuild CJS bundle, pino logging |
| ORM / DB | **Drizzle ORM 0.45** + PostgreSQL (`lib/db`), `drizzle-zod`, no migration files (uses `drizzle push`) |
| Frontend | **React 19 + Vite 7 SPA** (`artifacts/nch-ops`), wouter router, TanStack Query 5, Tailwind 4, shadcn/ui |
| API typing | Orval codegen: OpenAPI spec (`lib/api-spec`) → `lib/api-zod` + `lib/api-client-react` |
| Auth | Hand-rolled JWT (`jsonwebtoken`), **plaintext passwords in DB**, roles `mike/jack/jacob/partner` |
| File/photo storage | **Google Drive** (service account, domain-wide delegation) — no R2, no S3 |
| Email | **Gmail API** via googleapis — no Resend |
| Payments | **None.** No Square anywhere. Invoices are `mark-paid` only; no `payments` table |
| SMS | None (no Twilio) |
| Sync | Google Sheets master-workbook mirroring on every job/receipt/invoice event |
| Background | node-cron-style intervals in `index.ts` (DoorLoop sync, follow-up nudges, chat cleanup), socket.io, web-push |
| Tests | **Zero test files.** Only a UX-audit script + `ux-audit.yml` workflow |

Consequences for this extraction:

1. **The Square/webhook code the prompt says to "carry" does not exist.** Square is net-new (seam only in HH-01, per out-of-scope list).
2. **R2 is net-new.** SOURCE's photo path is Drive; we carry the *pattern* (base64 upload → URL on the receipt row), not the Drive client.
3. **Resend is net-new.** Nothing to copy; no email in HH-01 anyway.
4. **`Payment` is net-new.** SOURCE has no payment entity — the smoke-suite requirement (payment posts to invoice + job) cannot be copied, only written.
5. **Stack decision required** (Decision #1 below): follow the prompt's Next.js + Prisma scaffold (a port of the copied logic), or keep SOURCE's Express + Vite + Drizzle shape (a more literal copy). The inventory below is stack-neutral — "copy" means "carry the logic and schema," whichever scaffold wins.

---

## 1. Keep as-is

Small, generic pieces that come over essentially unchanged (paths relative to SOURCE).

| Item | Where | Notes |
|---|---|---|
| `requireAuth` / `requireRole` middleware pattern | `artifacts/api-server/src/middlewares/auth.ts` | Bearer-token JWT guard; generic |
| `logger` (pino) | `api-server/src/lib/logger.ts` | Generic |
| `app_settings` key/value table | `lib/db/src/schema/app-settings.ts` | Home for the job-level markup default |
| Client near-duplicate guard (`norm`/`levenshtein`/`findNearMatch`) + idempotent `ensureClient` | `api-server/src/routes/clients.ts` | Generic and genuinely useful for a low-tech user typing client names |
| `cn` util | `nch-ops/src/lib/utils.ts` | Generic |
| `use-toast`, `use-mobile` hooks | `nch-ops/src/hooks/` | Generic |
| shadcn/ui primitives (subset) | `nch-ops/src/components/ui/` | Only the ~12 components the kept pages import (button, card, input, label, select, dialog, drawer, badge, textarea, toast, separator, skeleton); the other ~35 stay behind |
| Plain-fetch API helper pattern | e.g. `nch-ops/src/features/work-orders/api.ts` | `authHeaders()` + `req<T>()` wrapper — this, not the Orval codegen, is the pattern HH uses everywhere |

## 2. Adapt

Everything that carries logic worth keeping but needs renaming, trimming, or rework. One line each on what changes.

### 2a. Data model (Drizzle schema in `lib/db/src/schema/`)

| Model | Change |
|---|---|
| `jobsTable` (`jobs.ts`) | Becomes `Job`: keep number/client/address/description/status/timestamps + money rollups. **Add** `type` enum `PERMIT_ONLY \| PROJECT \| OTHER`, **add** `name`, **add** `markupDefault` (seed 1.2 — placeholder, confirm). **Replace** 7-state status enum with `ESTIMATE \| ACTIVE \| DONE \| PAID`. **Drop** all 8 `statement*` columns, `depositAmount` auto-50% logic, `isOverBudget`. Job number `NCH-YYYY-NNN` → `HH-YYYY-NNN`. `client` is a free-text column in SOURCE — becomes a real FK to `Client` |
| `receiptsTable` (in `jobs.ts`) | Becomes `Expense`: keep `amount`→`cost`, `category`, `vendorName`, `notes`, `costDate`, photo URL. **Add** `clientPrice` (nullable, defaults cost × job markup), `billable` boolean, nullable `payableTo`/`payableAmount` (the Doug-payable seam — columns only, no UI/ledger). `driveFileId` → R2 object key |
| `invoicesTable` (`invoices.ts`) | Keep — already supports **multiple invoices per job** (FK to job, no uniqueness), which is exactly the staged-billing requirement. Drop `depositPaid` (replaced by real `Payment` rows), keep `totalAmount`/`balanceDue`/`status`/`dueDate`. Drop `type: estimate` (estimates are HH-02); drop `pdfUrl`/`driveFileId` for now |
| *(net-new)* `Payment` | No SOURCE equivalent. New table: invoice FK, job FK, amount, method (`SQUARE \| CHECK \| CASH \| OTHER`), `squarePaymentId` nullable (Square seam), paidAt. Posting a payment updates invoice `balanceDue`/`status` and the job money summary |
| `clientsTable` (`clients.ts`) | Keep name/email/phone + **add** `notes`. Drop `isRegular` (star for ~3 NCH regulars; Chris has a handful of clients total), drop `driveFolderId` |
| `usersTable` (`users.ts`) | Role enum `mike/jack/jacob/partner` → `owner/admin` (Chris, Jacob). **Passwords are plaintext in SOURCE — will be bcrypt-hashed in TARGET** (see Decision #3) |
| `jobNotesTable`, `statusHistoryTable` | Keep as-is structurally; cheap and useful for "what happened on this job" |
| `activityTable` (`activity.ts`) | Trim to job-module event types only; feeds a simple dashboard/recent-activity list |

### 2b. API routes (`artifacts/api-server/src/routes/`)

| Route file | Change |
|---|---|
| `jobs.ts` (569 ln) | Core keep. Strip: all Google Sheets `fireAndForget` blocks (~40% of the file), Drive upload (→ R2 upload with same base64→URL shape), `USER_DISPLAY` map, deposit=50%-of-estimate rule, `generate-estimate`/`generate-invoice` (superseded by the plain `POST /invoices` route). Receipt endpoints become expense endpoints with `clientPrice`/`billable`/payable fields; `totalCosts` rollup logic kept |
| `invoices.ts` (195 ln) | Keep create/list; `mark-paid` becomes `POST /invoices/:id/payments` (creates a `Payment`, recomputes balance, flips invoice → paid when balance hits 0, job → PAID when all invoices paid). Strip Sheets sync |
| `clients.ts` (230 ln) | Keep list/create/near-dup guard/`ensureClient`; **add** update (phone/email/notes). Strip Drive folder resolution (`resolveClientJobFolder`), strip `isRegular` star endpoint |
| `auth.ts` (107 ln) + `middlewares/auth.ts` | Keep shape (login → JWT, `/auth/me`, change-password). Fix: bcrypt compare instead of `user.password !== password`; JWT secret **required** from env (SOURCE falls back to a hardcoded `"nch-secret-2024"`); roles → `owner/admin` |
| `health.ts` | Trivial keep |

### 2c. Frontend (`artifacts/nch-ops/src/`)

| Item | Change |
|---|---|
| `App.tsx` router + `ProtectedRoute` | Keep the wouter + TanStack Query + auth-gate shape; routes shrink to login, jobs list, job new, job detail, log-expense, invoices, clients, client detail (8 vs ~30) |
| `components/layout.tsx` (122 ln) | Bottom-tab shell kept; NCH name/red `#8B0000` → "Harbor Haven Home Watch" placeholder text; nav shrinks to Jobs · Invoices · Clients. Jitterbug pass: base font ≥18px, tap targets ≥48px, one primary action per screen |
| `lib/auth.tsx` (117 ln) | Keep provider; `nch_token` localStorage key → `hh_token`; drop push-notification subscribe call |
| `pages/jobs.tsx` (145) | Keep list; new status filter values; show job type badge |
| `pages/job-new.tsx` (106) | Keep; add type picker (`PERMIT_ONLY/PROJECT/OTHER`); drop estimate-deposit math |
| `pages/job-detail.tsx` (731) | Heaviest adaptation: keep header/status/notes/expenses/money summary; **strip** statement-builder entry points, Sheets links, margin-vs-estimate framing (NCH-specific); money summary becomes billed / paid / outstanding / expenses / net |
| `pages/job-receipt.tsx` (228) | Becomes "Add expense": keep photo capture → base64 flow (retargeted at R2); add clientPrice/billable fields |
| `pages/invoices.tsx` (422) | Keep list + create-invoice-for-job + record-payment; strip estimate type, PDF/Drive buttons, Sheets status columns |
| `pages/clients.tsx` (69) / `client-detail.tsx` (152) | Keep; drop star/regular UI and Drive folder link; add notes field |
| `pages/login.tsx` | Keep; rebrand |
| `features/clients/*` (api, picker, link) | Keep picker (with near-dup "did you mean") — good fit for Chris; strip star logic |

### 2d. Config

| Item | Change |
|---|---|
| Versions | Carry SOURCE's: TS 5.9, React 19, Vite 7 / or Next 15 (per Decision #1), Tailwind 4, zod 3.25(v4 API), Drizzle 0.45 or Prisma (per Decision #1), TanStack Query 5. Node 24 → pin Node 22 LTS for Railway (**bump noted**) |
| `.env.example` | Net-new, HH-named only: `DATABASE_URL`, `AUTH_SECRET`, `R2_ACCOUNT_ID/R2_ACCESS_KEY_ID/R2_SECRET_ACCESS_KEY/R2_BUCKET`, `SQUARE_ACCESS_TOKEN/SQUARE_LOCATION_ID/SQUARE_WEBHOOK_SIGNATURE_KEY` (seam, unused in HH-01), `RESEND_API_KEY` (seam, unused). No `TWILIO_*` (no SMS in SOURCE or HH-01) |

## 3. Leave behind

Everything below stays in SOURCE. Reason given per row; the overarching one is Hard Rule 4 — NCH is a three-person property-management operation with tenants, rent, and an external partner; Harbor Haven is one near-retired owner with ≤5 open jobs.

### 3a. Whole subsystems (schema + routes + pages + services)

| Item | Why |
|---|---|
| Rent collection everything: `rent-status`, `rent-status-overrides` schema; `rent-status.ts`, `ledger.ts`, `returned-fees.ts`, `cash-collections.ts` routes/services; DoorLoop client + sync + seeding | Hard Rule 2 — explicitly forbidden, and tenant/rent concepts have no HH meaning |
| Tenancy/property domain: `properties`, `tenant-directory`, `tenant-notes`, `tenant-applications`, `available-properties`, `placements`, `evictions`, `monthly-contact-log`, `utility-submissions` schemas + their routes/pages | HH has no tenants or managed properties; a job's `address` is a plain text field |
| `work-orders` (Iconn partner work orders) + partner portal + `partner` role | External-partner complexity HH doesn't have |
| Google Sheets sync (`sheets-sync.ts`, `sync` schema, sheet-write log, all `fireAndForget` call sites, sheet scripts) | NCH's master-workbook mirror; HH's DB is the single source of truth |
| Google Drive integration (`google-drive.ts`, `drive.ts` route, folder trees, `drive_file_id` columns) | Replaced by R2 per spec |
| Gmail/email (`email.ts`), `followup` + nudge crons, `communications`, `messages`/chat + socket.io + chat upload/cleanup, `web-push.ts` + `push.ts` + PWA banner | Multi-user coordination machinery for a 3-person team; HH-01 has no email/chat/push. PWA is explicitly out of scope |
| AI assistant (`assistant.ts` route, `assistant-*` services, `@anthropic-ai/sdk`) | Not requested for HH |
| `tasks`, `task-followup`, `appointments`, `contact-checklist`, `directory`, `docs`/doc-maker (`doc-schemas`, `run-doc-maker`, `doc-history`), `weekly-report`, `dashboard` (NCH-wide), `forms` (tenant application / utilities), document-scanner, `contractors` feature | NCH ops breadth; each exists for multi-user/portfolio scale. Contractor tracking may return when the Doug ledger is built (HH-02+), but the NCH version is Iconn/property-shaped |
| `expenses.ts` schema + route + page (company expense sorter: `payeeEntity`, `propertyGroup`, tax-year sorting) | NCH multi-entity bookkeeping; the job-scoped `receiptsTable` (→ `Expense`) is the concept HH keeps — **name collision to be aware of, they are different tables** |

### 3b. Job-module-adjacent pieces deliberately not carried

| Item | Why |
|---|---|
| Statement / Cost-Detail document system: `statementsTable`, `jobScopeItemsTable`, `itemCatalogTable`, `job-reports.ts` (565 ln), `job-build.tsx` (388 ln), `invoice-builder` feature, `pdf.ts` + `pdf-generator.ts` + `doc-filename.ts` | This is NCH's investor-client estimate/statement builder — the prompt's out-of-scope list ("estimate builder UI") in different clothes, hard-branded Nice City Homes (footer, colors, Jack's contact). The *markup* idea it embodies survives as `Expense.clientPrice`. PDF invoices for HH can ride on Square in HH-02 |
| `estimate` invoice type + `generate-estimate` endpoint | Estimate builder is HH-02+ |
| Orval codegen stack: `lib/api-spec` (OpenAPI yaml), `lib/api-zod`, `lib/api-client-react` | Heavy machinery (spec → generated hooks/schemas) for a large API surface. HH's ~20 endpoints use hand-written zod schemas + the plain-fetch helper. Newer NCH routes (work-orders, job-reports) already abandoned the generated client |
| Startup seeds in `index.ts` (NCH users w/ real phone numbers, regular clients, available properties, audit users, Iconn partner) | NCH data — Hard Rule 1. HH gets a fresh fake-data seed |
| Monorepo shape (pnpm workspace, `artifacts/*`, catalog, esbuild bundling, Replit config, `replit.md`, `.replit-artifact`, nixpacks/uv/python remnants, `attached_assets`, `mockup-sandbox`) | One small app doesn't need a workspace; TARGET is a single package |
| `ux-audit.yml` workflow + `scripts/src/audit` | NCH-specific audit harness; HH CI is build + migrate + smoke test |
| `use-dictation`, `pdf-to-image`, `present-pdf`, `preview-cache`, `property-utils`, `property-picker`, `sheet-button-row`, `NotificationBanner`, `link-preview`, `message-templates` | Belong to left-behind features |
| Tests | Nothing to carry — SOURCE has none. Smoke suite is net-new (Vitest) |

---

## 4. Transitive dependencies of the job module

Everything `jobs.ts` / `invoices.ts` / `clients.ts` / kept pages import from elsewhere in SOURCE, with a decision each:

| Dependency | Used by | Decision |
|---|---|---|
| `@workspace/db` (db client + schema barrel) | every route | **Replace** — local schema per §2a, single-package |
| `@workspace/api-zod` (`CreateJobBody`, `UpdateJobBody`, `ListJobsQueryParams`, `CreateReceiptBody`, `LoginBody`, …) | routes + auth | **Replace** with minimal hand-written zod schemas (the generated ones drag in the whole OpenAPI surface) |
| `lib/api-client-react` (generated hooks) | some older pages | **Drop** — kept pages use the plain-fetch pattern |
| `middlewares/auth` (`requireAuth`, `AuthRequest`) | every route | **Copy in** (with bcrypt/env-secret fixes) |
| `lib/logger` | routes | **Copy in** |
| `lib/sheets-sync` (`fireAndForget`, `fmtDate`) | jobs, invoices | **Drop** (`fmtDate`: 4-line local util) |
| `lib/google-drive` (`uploadBase64ToDrive`, `resolveOrCreateFolderPath`, `uploadFileToDrive`) | jobs, clients, pdf | **Replace** with a minimal R2 client exposing the same `uploadBase64 → url` seam |
| `routes/clients#ensureClient`, `resolveClientJobFolder` | jobs, job-reports | `ensureClient` **copy in**; folder resolver **drop** |
| `activityTable` | jobs, invoices | **Copy in**, trimmed |
| `appSettingsTable` | job-reports (FROM contact) | **Copy in** as the markup-default home; FROM-contact use stays behind |
| `lib/pdf-generator`, `run-doc-maker`, `doc-filename` | pdf, job-reports | **Drop** (statement system left behind) |
| Frontend `lib/auth.tsx`, `lib/utils.ts`, `hooks/use-toast`, `use-mobile`, `components/ui/*` | kept pages | **Copy in** (auth adapted; ui subset only) |
| `components/layout.tsx` | kept pages | **Copy in**, rebranded + Jitterbug sizing |
| socket.io client, web-push client, `NotificationBanner` | layout/auth in SOURCE | **Drop** — remove call sites during adapt |

---

## 5. Decisions for Jacob (blocking Step 2)

1. **Stack.** Prompt says Next.js App Router + Prisma; SOURCE is actually Express 5 + Vite/React SPA + Drizzle. Options: **(a)** keep SOURCE's shape — most literal copy, lowest porting risk, but two processes (API + SPA) and Drizzle-push instead of real migrations; **(b)** follow the prompt — Next.js 15 + Prisma on Railway (the `valentinaapp` house pattern), which means porting route logic into route handlers/server actions and translating the schema to Prisma; schema/logic carry over 1:1, but every file is touched. I lean **(b)** as written in the prompt (single deploy, real migration history from zero, matches your other client apps) — but it changes "copy" into "port," so it's your call.
2. **Payments/Square reality.** SOURCE has no Square, no payments table, no webhooks. HH-01 will build a minimal local `Payment` model (with `squarePaymentId` seam) and leave real Square integration entirely to HH-02. Confirm that matches your expectation, since the prompt implied Square code existed to carry.
3. **Auth hardening.** SOURCE stores plaintext passwords and has a hardcoded JWT fallback secret. TARGET will use bcrypt + required env secret. This is a deliberate deviation from "reuse SOURCE auth pattern" — flagging per Honest State rule.
4. **Photo storage.** Prompt assumes R2; SOURCE uses Google Drive. Plan: minimal R2 client behind the same upload seam, `R2_*` env vars, receipt photo = R2 key. In the smoke test the upload is stubbed. Confirm R2 (vs. keeping Drive with an HH service account).
5. **Statement/Cost-Detail + PDF system left behind entirely** (it's the estimate-builder in NCH clothing, hard-branded NCH). The markup concept survives as `Expense.clientPrice`. Confirm you don't want the PDF generator carried and de-branded now.
6. **Markup default 1.2** seeded as an app-setting placeholder, overridable per job — confirm the number with Chris later (noted for `KNOWN-LIMITS.md`).
7. **Job number format** `HH-YYYY-NNN` carried from NCH's pattern — fine, or does Chris want something simpler?
