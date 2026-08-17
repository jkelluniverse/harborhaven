# KNOWN-LIMITS

Honest-state log. Everything stubbed, simplified, or deliberately deferred
lives here. "Source" below means the system this module's behavior was ported
from. Updated for HH-02 (billing, Square Invoices, permit/Doug ledger).

## Deferred to later phases (intentional, not bugs)

- **SMS delivery (HH-03).** Estimates go by email (Resend) and shareable link
  only. Square sends invoice email; texting the invoice `publicUrl` waits for
  Twilio in HH-03.
- **Home watch (HH-03).** `HOME_WATCH_VISIT` exists as a line-item kind so the
  enum won't need a migration, but nothing creates one yet.
- **PWA install & real branding (HH-04).** Placeholder name-only branding.
- **Client login.** Never in scope; the estimate page is token-link public,
  the invoice page is Square-hosted.
- **Editing money records.** Append-only by design: invoices can be canceled
  (until a payment posts), payables can be un-paid within 5 minutes, and
  everything else needs a DB fix. Revisit after Chris uses it.

## Square integration — what's real and what isn't

- **Sandbox-verified path only by script.** `scripts/square-sandbox-check.ts`
  creates and cancels a real sandbox invoice; run it before first deploy. The
  automated tests mock nothing but also **call nothing** — webhook fixtures
  carry the ids locally, so no test touches Square.
- **Resend-invoice is a re-publish guard, not a true resend.** Square has no
  plain "resend" API; our "Resend via Square" re-runs the idempotent send
  (no-op if already sent) and surfaces the hosted `publicUrl` to share by
  hand. Good enough until HH-03 texts the link.
- **`invoice.payment_made` amounts:** we take the payment object's amount
  when present; fee capture depends on Square including `processing_fee` in
  the event (it sometimes arrives only on later `payment.updated` events we
  don't yet consume — fees may lag or stay null on some payments).
- **Webhook URL must be exactly** `https://<domain>/api/square/webhook` —
  the HMAC covers the URL, so a proxy that rewrites host/proto breaks
  verification (we honor `x-forwarded-*`).
- **ACH acceptance** is requested via `accepted_payment_methods.bank_account`;
  whether Square actually offers ACH depends on the account's country/
  capabilities — verify once in sandbox and once on the real account.

## Money definitions (locked in HH-02 §0, interpreted)

- `net` ("Net to Chris") = billed − expenses − **Doug's whole cut** (all
  payables on the job, paid or not). `inHand` = paid − expenses − Doug paid
  out so far. The spec's literal wording said "dougOwed"; subtracting only
  the *unpaid* portion would make net jump up the moment Doug is paid, so
  the whole-cut reading was implemented. Flagged in the report for Jacob.
- "Estimated" on the job page = Σ line items (not the old estimateAmount
  concept, which no longer exists).

## Stubs and simplifications

- **R2 photo upload still unverified against a real bucket** (unchanged from
  HH-01); expenses save without a photo URL when R2 is unset. No photo
  viewer screen yet.
- **Markup default (1.2) and permit numbers ($1,500 / $500) are settings**
  (`default_markup`, `permit_price`, `permit_payable`, `permit_payee_name`)
  seeded with the standing-deal values; no settings screen — changing them
  is a one-line DB update. Job-level markup is stored per job but there is
  no per-job markup edit screen yet.
- **Seeded logins are placeholder credentials** (`chris` / `jacob`, password
  `harborhaven`). There is now a change-password screen (Me tab) — use it
  right after the first real deploy.
- **Estimate page is unstyled-simple** (one card, line items, total) and the
  estimate email is inline HTML — fine for HH-02, revisit with branding.
- **Doug undo window is 5 minutes** and applies to payables only. Undoing a
  *payment* (recorded via webhook or "paid another way") is a DB fix.
- **`Payment.receivedAt`** replaced HH-01's `paidAt` (rename migration).
  The spec's `Invoice.dueAt` maps onto the existing `dueDate` column rather
  than adding a duplicate.

## Deliberate hardening (deviations from the source, by design)

- Passwords bcrypt-hashed; session secret required (no fallback).
- Webhook signature verified before the body is parsed; constant-time
  compare; idempotency lock on the Square event id AND a unique index on
  `squarePaymentId`, so neither replayed events nor duplicate notifications
  can double-post money.

## Inventory deviations (HH-01, still true)

- Activity feed dropped (StatusHistory + JobNote cover it for one owner).
- shadcn/ui not carried (small local components); TanStack Query/wouter
  replaced by server components + actions.
