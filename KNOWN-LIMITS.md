# KNOWN-LIMITS

Honest-state log. Everything stubbed, simplified, or deliberately deferred
lives here. "Source" below means the system this module's behavior was ported
from. Updated for HH-02 (billing, Square Invoices, permit/Doug ledger).

## Version note: Next 16 (bumped from 15.5 for a production bug)

Next 15.5.23 has a router bug where a route segment named `app` combined
with the project running in a directory named `/app` (Railway's fixed
workdir) mounts `app/app/layout.tsx` — our session gate — around **every**
route, redirect-looping the whole site to `/login` in production while
behaving perfectly in any other directory. Reproduced locally by serving
from `/app`; fixed by Next 16.3.1 with zero code changes. Follow-up chore:
Next 16 deprecates the `middleware.ts` file convention in favor of
`proxy.ts` (warning at build; still functional) — rename during HH-04.

## HH-03 honest state

- **Testimonials are not on the site.** The copy doc says to carry the two
  existing ones verbatim with Chris's OK — I don't have their text, so the
  section is deliberately omitted (placeholder comment in `app/page.tsx`).
  Never invent quotes; paste the real ones in when confirmed.
- **Logo slot is wired, file still needed.** `components/logo.tsx` renders
  `public/brand/logo.jpg` (or .png/.webp) the moment the file exists and
  falls back to the text wordmark until then — the image Jacob shared arrived
  as a chat preview only, not a committable file. Commit the actual file to
  `public/brand/` (or push it via any git client); no code change needed.
  Palette tokens were re-tuned to the real logo (deep palm green, cream,
  muted gold); gold is decorative-only because white-on-gold fails AA
  contrast — CTAs use the green.
- **Public email is a placeholder** (`info@harborhavenhomewatch.com` in
  `app/page.tsx`) — the copy doc left `[email]` open. Also confirm the public
  contact name (old site says "John Mundorff").
- **Lead rate limit is in-memory** — per-instance, resets on deploy. Fine for
  one small site on one Railway instance; move to a DB counter if it ever
  scales out. The honeypot has no captcha fallback by design.
- **Twilio delivery requires registration.** Toll-free verification or A2P
  10DLC campaign registration must be completed (Jacob) before US carriers
  deliver; until then sends log as sent-but-filtered or fail. Unconfigured
  Twilio logs sends as "skipped".
- **CUSTOM visit frequency advances 7 days** after each report, same as
  weekly — a per-job custom interval field wasn't built. Chris can ignore the
  due date on CUSTOM jobs or we add an interval later.
- **`visit_rate` seeded at $75/visit — placeholder** until Chris prices it
  (app-setting, per-job override stored on the job).
- **Visit reports mark sent only when the email succeeds**; without Resend
  the report HTML is stored and `nextVisitDue` does not advance (so the visit
  stays visibly "unsent"). Resending is per-visit from the job page.
- **No pageview analytics** — the spec allowed "a simple pageview count if
  trivial"; skipped entirely rather than half-built.
- **Lighthouse mobile ≥90 is unverified in this environment** — the home
  page is one server-rendered HTML file (~36 KB) with ~103 KB shared JS and
  no images yet, so it should clear 90, but run Lighthouse once after the
  first deploy to confirm.
- **Duplicate-name leads get a phone-suffix name** ("John Smith (5551)") —
  Client.name is unique; two real people with the same name both get rows.

## Deferred to later phases (intentional, not bugs)

- **Client login/portal, online scheduling, multi-property home watch** —
  explicitly out of scope; one job per property is the model.
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
