# Staged draft: PayPal on the existing-song preview checkout

**Status: source staging only. Nothing here runs.** No file in this folder is
imported by the app or by any deployed function. No migration was applied, no
function was deployed, no flag was flipped, no provider was called, no
production row was written, no email was sent, no song was generated.

The cancellation/flag-roundtrip fix (item A) is intentionally absent — the parent
is implementing that locally, so it is not duplicated here.

## Files

| File | Becomes, at launch | Notes |
| --- | --- | --- |
| `shared/lead-paypal-core.ts` | `supabase/functions/_shared/lead-paypal-core.ts` | Pure logic: quote snapshot, hashed return secret, capture verification, gating. No I/O. |
| `sql/001_paypal_lead_attempts.sql.txt` | a migration | `.sql.txt` so it cannot be picked up. **Unapplied.** |
| `functions/create-paypal-lead-order/index.ts` | same path under `supabase/functions/` | Default-disabled. Has one deliberate hole (see Blockers). |
| `functions/_shared/lead-paypal-finalize.ts` | same | The single finalizer for every rail. |
| `functions/capture-paypal-lead-payment/index.ts` | same | Browser return. Not gated on the creation flag. |
| `functions/reconcile-paypal-lead-attempts/index.ts` | same | No browser, no return secret, `MONITOR_API_KEY` only. **No cron installed.** |
| `functions/stripe-lead-convergence.patch.txt` | described edits to 2 existing functions | Additive, behind `lead_finalizer_v2_enabled`. |
| `frontend/SongPreview.paypal-block.tsx.txt` | edits to `src/pages/SongPreview.tsx` | `.txt`, inert. |
| `frontend/PaymentSuccess.lead-paypal-branch.tsx.txt` | edits to `src/pages/PaymentSuccess.tsx` | `.txt`, inert. |
| `tests/*.test.ts` | stay here | Pure + mocked. 44 tests. |

## Deployment facts (asked explicitly)

- Editing a file under `supabase/functions/` in this project **does** get that
  function deployed by the build pipeline — independently of Publish. Publish
  only affects the static frontend. This is exactly why every draft here lives
  under `docs/` and why the function drafts are not at their launch paths.
- Migrations reach the shared backend the moment they are applied; there is no
  separate preview database. Preview and published app share one instance. Hence
  the `.sql.txt` extension.
- Therefore: moving these files to their launch paths **is** the deploy step. It
  must be a deliberate, reviewed action, not a side effect of drafting.

## Safety design

**Immutable server quote.** `buildLeadQuoteSnapshot` freezes `base_cents`,
`package_cents`, `total_cents`, `USD`, and a by-value snapshot of the existing
song asset URLs, and is persisted **before** the PayPal approval URL is returned.
If that write fails, the function fails closed and no approval URL exists. The
client sends only the preview token and boolean intent; it never sends a price
and never supplies song assets.

**Return secret.** 32 random bytes, given to the browser in the return URL,
stored only as SHA-256, compared in constant time, single-use after a decision is
reached. Browser capture requires it; reconciliation and webhooks do not (they
authenticate by service key / signature), so a lost browser never strands money.

**Capture verification.** Every one of these must hold or nothing unlocks:
provider order id equals the bound one, capture status `COMPLETED`, currency
exactly `USD`, amount exactly the stored total (over *and* under are rejected),
payee merchant id equals ours, capture id present. A failure writes
`payment_incidents` and returns an incident. There is no path where a mismatch
grants the song.

**Atomicity.** `finalize_lead_payment` is one transaction that takes
`SELECT ... FOR UPDATE` on the lead, then re-checks for a canonical order. So
check-then-insert is no longer racy, and uniqueness is not assumed: the SQL also
adds the missing `idx_orders_paypal_lead_unique` partial unique index on
`notes = 'paypal_lead:%'` (the Stripe and normal-PayPal equivalents already
exist — verified read-only against production metadata). Uniqueness is thus
enforced twice: by the lock and by the index.

**Duplicate payments.** If a lead already has a canonical order and a second
settled payment arrives (buyer switched providers, two tabs, webhook + browser),
the second is written to `payment_incidents` as `duplicate_payment` for human
resolution. **No automatic refund, no cancellation, no customer email.** The
buyer still lands on their song.

**Provider switching is allowed.** Nothing blocks PayPal because a Stripe
session exists — a buyer whose card failed must be able to switch. The lead lock
is what keeps that safe.

**Recovery without a browser.** The attempt row is durable before approval, so
`reconcile-paypal-lead-attempts` can finish any attempt in
`approval_pending`/`captured` older than 10 minutes: it captures (or recovers an
`ORDER_ALREADY_CAPTURED`), verifies, and finalizes. Capture succeeded but local
write failed → status stays `captured`, a `finalize_failed` incident is written,
the caller is told `pending`, and the next reconciliation run completes it.
Recovery is **not** gated on the creation flag, so a rollback cannot orphan an
approved payment.

**Uncertain outcomes.** Only `INSTRUMENT_DECLINED` is ever reported as "no
payment was taken". Timeouts, 5xx, and unknown errors return `pending` with
"we're confirming" copy. Tested.

**Missing paid assets.** If the finalizer finds the lead's song URL gone, it
writes a `missing_assets` incident and returns `missing_assets`; it does **not**
regenerate anything and does not mark the sale fulfilled.

## Launch blockers (launch stays disabled)

1. **`resolveLeadOfferCents` is not implemented.** `create-paypal-lead-order`
   deliberately does not reimplement pricing. The follow-up/vday10/promo
   eligibility and expiry logic currently lives inline in
   `create-lead-checkout/index.ts`. It must first be extracted, unchanged, into
   `_shared/lead-checkout.ts` and reused by both rails. Until then the draft does
   not compile — on purpose, so it cannot be shipped by accident.
2. **Merchant payee id.** `PAYPAL_PAYEE_MERCHANT_ID` is not set, and payee
   verification refuses to pass without it. The owner must supply the merchant id
   from the PayPal business account; the code will not guess or skip it.
3. **Stripe convergence ordering.** `lead_finalizer_v2_enabled` must be enabled
   and verified on the Stripe rail *before* PayPal creation is enabled, or a
   cross-rail duplicate-order window remains. The RPC's order insert must first
   be diffed field-by-field against `buildLeadAssetPatch()`.
4. **SQL unapplied.** No `paypal_lead_attempts`, no `payment_incidents`, no new
   index, no RPC exists yet, so `attemptTableReady` is false in production.
5. **Recovery scheduling undecided.** The reconciliation function exists but no
   cron is installed, per instruction. It needs a schedule (suggest every 15 min)
   or an existing scheduler hook before launch.
6. **Declined-return link.** The success page has no preview token in the return
   URL, so the "try a card instead" link cannot deep-link back to the preview.
   Either add the token to the return URL (harmless, it is already emailed) or
   point the buyer at their email. Needs a decision.

## Test boundary

Real integration testing is **not possible** here and was not attempted. There is
no PayPal sandbox credential in this project, no isolated database, and the only
Supabase instance is production. So:

- `tests/lead-paypal-core.test.ts` — 25 pure tests, no mocks needed.
- `tests/lead-paypal-finalize.mock.test.ts` — 19 tests with `fetch` and the
  database client both faked in-process.
- **Not covered by any test run so far:** the SQL (never executed anywhere), real
  provider behaviour, real concurrency on the lead lock, and the Deno function
  handlers' HTTP wiring. These need a genuine PayPal sandbox account plus a
  throwaway Postgres before launch. I am not claiming they work.

```
bunx vitest run --config docs/checkout-staging/vitest.config.ts
```

## Rollout / rollback

Rollout: extract pricing (blocker 1) → set payee id → apply SQL → move function
files to their launch paths (still both flags false) → enable
`lead_finalizer_v2_enabled`, watch Stripe leads → sandbox-test PayPal →
enable `lead_paypal_creation_enabled` → move the two frontend edits.

Rollback: set `lead_paypal_creation_enabled` to false. The button disappears and
no new PayPal attempt can be created, while capture and reconciliation keep
finishing every payment already approved. Set `lead_finalizer_v2_enabled` to
false to return Stripe to its current code path. No data is deleted on rollback.
