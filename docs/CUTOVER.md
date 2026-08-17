# Domain Cutover — harborhavenhomewatch.com → Railway

Jacob executes this; nothing here runs automatically. Goal: the domain that
currently points at the GoModern site serves this app (public site at `/`,
owner app at `/app`).

## 0. Before touching DNS

- [ ] Staging deploy on Railway is green: migrate ran, seed done, smoke suite
      passed in CI, and you can log in at the Railway-generated URL.
- [ ] `AUTH_SECRET`, `DATABASE_URL`, Square vars, `RESEND_*`, `TWILIO_*`,
      `OWNER_PHONE`, `R2_*` are set on the production service.
- [ ] Note the current DNS records at the registrar (screenshot them) — this
      is the rollback.

## 1. Railway custom domain

1. Railway service → Settings → Networking → Custom Domain.
2. Add `harborhavenhomewatch.com` (apex) and `www.harborhavenhomewatch.com`.
3. Railway shows the target records — typically a `CNAME` for `www` and
   either an `ALIAS`/`ANAME` or an `A` record set for the apex (registrar
   dependent; Railway's UI tells you exactly which).

## 2. At the registrar

1. Replace the existing apex record (currently GoModern) with Railway's
   apex target.
2. Replace/add `www` → Railway's CNAME target.
3. Delete any other GoModern/LeadConnector records for this hostname
   (old A records, forwarding rules). Leave MX/email records alone.
4. TTL: if the registrar lets you, drop TTL to 300s an hour before the
   change so mistakes heal fast.

## 3. Verify (after propagation, minutes to ~1h)

- [ ] `https://harborhavenhomewatch.com` loads the new home page with a valid
      TLS certificate (Railway provisions it automatically once DNS points
      over; the padlock must show, no warning).
- [ ] `https://www.harborhavenhomewatch.com` also resolves (and ideally
      redirects to the apex — configure the redirect in Railway if offered).
- [ ] `/login` works; `/app/jobs` requires login.
- [ ] Submit the quote form once yourself → row appears in
      `/app/clients` as a lead, SMS/email notification arrives.

## 4. Third-party URLs that embed the domain

- [ ] **Square:** developer dashboard → your app → Webhooks → update the
      subscription URL to `https://harborhavenhomewatch.com/api/square/webhook`
      (production app). Send Square's test event; confirm 200 in the logs.
- [ ] **Twilio:** no inbound webhook in HH-03 (outbound only) — nothing to
      change. If inbound SMS is added later, update the number's webhook.
- [ ] **Resend:** verify the sending domain (DNS records Resend shows —
      DKIM/SPF) so estimate/report emails don't land in spam.

## 5. Retire the GoModern site

- [ ] Confirm one week of correct operation.
- [ ] Cancel/downgrade the GoModern subscription so it stops billing.
- [ ] Keep a copy of anything still needed from it first (the two
      testimonials, any photos Chris owns).

## Rollback

Repoint the apex + `www` records at the registrar back to the values from
step 0's screenshot. The old site returns as DNS propagates (fast if TTL was
lowered). Nothing in this app needs to be undone — it keeps working at the
Railway-generated URL either way.
