# KNOWN-LIMITS

Honest-state log for HH-01 (job module extraction). Everything stubbed,
simplified, or deliberately deferred lives here. "Source" below means the
system this module's behavior was ported from.

## Seams left for later phases (intentional, not bugs)

- **Permit payable (the GC split).** `Expense.payableTo` / `Expense.payableAmount`
  exist as nullable columns and the expense form does not expose them. This is
  the seam where the permit pattern attaches (bill the client the permit line,
  immediately owe the license holder their fee): a permit expense will carry
  `payableTo` + `payableAmount`, and a later ledger screen will track whether
  that payable has been sent. No ledger, no UI, no automation yet (HH-02+).
- **Square.** `Invoice.squareInvoiceId` and `Payment.squarePaymentId` are
  nullable columns never set by HH-01 code. `Payment.method` accepts `SQUARE`
  so manually-recorded Square payments are distinguishable now. Real Square
  Invoices + webhook posting is HH-02. `SQUARE_*` env vars are reserved in
  `.env.example` but unread.
- **Email.** No email of any kind in HH-01. `RESEND_API_KEY` reserved, unread.
- **Home watch.** Not modeled at all. `JobType` has `OTHER` as the escape
  hatch; a `HOME_WATCH` job type plus recurring visits is a later phase.

## Stubs and simplifications

- **R2 photo upload is written but unverified against a real bucket.**
  `lib/storage.ts` implements R2's S3 API via aws4fetch. With `R2_*` env vars
  unset (as in tests and this dev environment) the upload is skipped and the
  expense saves with `photoUrl = null` — same degrade-gracefully behavior the
  source had when its photo backend failed. First staging deploy with real R2
  credentials needs a manual upload check. There is also no photo *viewing*
  screen yet — the job detail row shows a "📷 receipt" marker only, and the
  photo is reachable at its R2 URL.
- **Markup default is a placeholder.** Seeded as `1.2` in `app_settings`
  (`markup_default`) and copied onto each job at creation. Chris's real markup
  is unknown — confirm and update the setting. There is no settings screen;
  changing it is a one-line SQL/Prisma update for now.
- **Seeded logins are placeholder credentials** (`chris` / `jacob`, password
  `harborhaven`). Rotate via the seed or a manual update before anything
  real happens on a deployed instance. There is no change-password screen yet
  (the source had one; it was left out of HH-01 scope — small follow-up).
- **Invoice/payment editing is append-only.** No edit or delete for expenses,
  invoices, or payments in the UI — a mistyped amount currently needs a DB
  fix. Fine at 2–5 jobs/month; revisit if it stings.
- **No estimate documents.** The source's customer-facing Statement /
  Cost-Detail PDF system was deliberately left behind; Square Invoices will be
  the client-facing document in HH-02. Nothing in HH-01 prints or emails.
- **`Job.status` and invoice status are coupled only one way.** Paying all
  invoices flips the job to PAID automatically; manually setting the job to
  PAID does not touch invoices.
- **Single-session auth, no roles enforcement beyond login.** Both seeded
  users see everything. `Role` (OWNER/ADMIN) is stored but no screen is
  role-gated yet — with two trusted users there is nothing to gate.

## Deliberate hardening (deviations from the source, by design)

- Passwords are **bcrypt-hashed**; the source stored plaintext.
- The session secret (`AUTH_SECRET`) is **required** — the app throws instead
  of falling back to a hardcoded string as the source did.

## Inventory deviations (adapt → leave, decided during the build)

- **Activity feed dropped.** The inventory marked the source's activity table
  "adapt (trimmed)". It exists so a multi-user team can see each other's
  actions; with one owner and no dashboard it duplicated `StatusHistory` +
  `JobNote`. Left behind.
- **shadcn/ui not carried.** Inventory said "keep a subset"; per the
  port-behavior-not-structure decision, the UI is ~10 small Tailwind
  components in `components/ui.tsx` instead of vendored shadcn files.
- **TanStack Query / wouter not carried.** Server components + server actions
  replace the SPA data layer entirely.
