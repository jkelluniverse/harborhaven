# Harbor Haven Home Watch

Job tracking for Harbor Haven Home Watch LLC (Sarasota, FL). Phone-first,
big-type ("Jitterbug standard"), single-owner app: clients, jobs, expenses
with receipt photos, staged invoices, payments.

Built by Kell Systems Consulting LLC. HH-01 scope; see `KNOWN-LIMITS.md` for
what is deliberately deferred, and the extraction inventory in `docs/` for
what was ported from the source system and what was left behind.

## Stack

- Next.js 15 (App Router) + TypeScript + Tailwind CSS 4
- Prisma + PostgreSQL (Railway)
- Auth: single owner + one admin, bcrypt + signed session cookie (`jose`)
- Receipt photos: Cloudflare R2 (S3 API via `aws4fetch`); optional — the app
  runs without it
- Tests: Vitest write-path smoke suite (`test/smoke.test.ts`)

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

## Deploy (Railway)

1. Provision a Postgres plugin; Railway injects `DATABASE_URL`.
2. Set `AUTH_SECRET` (`openssl rand -base64 32`).
3. Optional now, needed for receipt photos: `R2_ACCOUNT_ID`,
   `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_URL`.
4. Build command `npm run build`; start command
   `npx prisma migrate deploy && npm run start`.
5. Seed once from a shell: `npm run db:seed`, then change both passwords.
