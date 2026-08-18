# Harbor Haven Home Watch

Job tracking and billing for Harbor Haven Home Watch LLC (Sarasota, FL).
Phone-first, big-type ("Jitterbug standard"), single-owner app: clients,
jobs, expenses with receipt photos, line items, staged invoices sent through
Square (hosted payment page, ACH free / card with fee), automatic payment
posting via Square webhooks, and the permit ledger ("What Doug is owed").

Built by Kell Systems Consulting LLC. HH-01 scope; see `KNOWN-LIMITS.md` for
what is deliberately deferred, and the extraction inventory in `docs/` for
what was ported from the source system and what was left behind.

## Stack

- Next.js 16 (App Router) + TypeScript + Tailwind CSS 4
- Prisma + PostgreSQL (Railway)
- Auth: single owner + one admin, bcrypt + signed session cookie (`jose`)
- Receipt photos: Cloudflare R2 (S3 API via `aws4fetch`); optional — the app
  runs without it
- Payments: Square Invoices via plain REST (no SDK) — order → invoice →
  publish, webhook at `/api/square/webhook` posts payments automatically
- Email: Resend via plain REST (estimate delivery); optional
- Tests: Vitest write-path suites (`test/smoke.test.ts`, `test/billing.test.ts`)

## Local development

Requires Node 22+ and a Postgres database.

```bash
cp .env.example .env      # fill in DATABASE_URL and AUTH_SECRET (R2/Square optional)
npm install
npx prisma migrate deploy # apply migrations
npm run db:seed           # placeholder users + fake sample data
npm run dev               # http://localhost:3000
```

Seeded logins (placeholders — rotate before real use): `chris` / `harborhaven`
(owner), `jacob` / `harborhaven` (admin).

## Checks

```bash
npm run typecheck
npm run build
npm run smoke   # needs DATABASE_URL; creates and removes its own rows
```

CI (`.github/workflows/ci.yml`) runs typecheck, build, migrate, and the smoke
suite against a Postgres service container on every push.

## Square setup (sandbox first)

1. Create a Square developer application → Sandbox tab → copy the sandbox
   access token into `SQUARE_ACCESS_TOKEN`, set `SQUARE_ENVIRONMENT=sandbox`.
2. Verify credentials + invoice lifecycle:
   `npx tsx scripts/square-sandbox-check.ts` (creates and cancels a sandbox
   invoice; refuses to run against production).
3. In the developer dashboard, add a webhook subscription pointing at
   `https://<your-domain>/api/square/webhook` for `invoice.*` and
   `payment.*` events; copy its signature key into
   `SQUARE_WEBHOOK_SIGNATURE_KEY`.
4. Going live: swap in the production access token, set
   `SQUARE_ENVIRONMENT=production`, set `SQUARE_LOCATION_ID` (or let the app
   discover and cache it), and re-create the webhook subscription against
   the production app.

## Deploy (Railway)

1. Provision a Postgres plugin; Railway injects `DATABASE_URL`.
2. Set `AUTH_SECRET` (`openssl rand -base64 32`).
3. Optional now, needed for receipt photos: `R2_ACCOUNT_ID`,
   `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`.
4. Square vars per the section above; `RESEND_API_KEY` + `RESEND_FROM` for
   estimate emails (optional — estimates fall back to a shareable link).
5. Deploy the repo from GitHub (branch as configured). `railway.json` pins
   the rest: migrations run as the pre-deploy step, start is `npm run start`,
   healthcheck at `/api/health`. Avoid `railway up` from a local checkout —
   it deploys whatever is on that disk, uncommitted edits included.
6. Seed once from a shell: `npm run db:seed`, then change both passwords
   (Me tab → Change my password).
