# Preview Checkout: Cancellation Fix (now) + Default-Off PayPal (gated)

Plan only. Corrected per review. No live traffic, no test charges, no refunds, no cancellations, no customer/email/generation mutations at any point in this plan. All verification is offline: pure unit tests plus mocked integration tests against fixtures. Any migration is authored as source only and left unapplied until you say otherwise.

## 0. Corrections accepted

- **No $0.50 test-email override. No production test leads. No live charges/refunds/cancellations.** Removed entirely.
- **The follow-up flag is currently accepted unconditionally.** Confirmed: `create-lead-checkout` destructures `applyFollowupDiscount` from the request body and uses it directly at lines 167/172 with no eligibility lookup. Only *targeted* `promoSlug` requests are validated against `order_activity_log`. My earlier plan implied otherwise; that was wrong. This plan does **not** change that trust model and does **not** claim eligibility exists for it.
- **Scope of fix 1 is roundtrip only:** carry the flags that were already present in the inbound URL back into `cancel_url` via `URLSearchParams`. No sessionStorage, no new discount policy, no renewed lifetime discount.
- **No origin-header trust.** The existing `req.headers.get("origin") || fallback` pattern is not treated as a precedent.

## 1. Verified current state

- `create-lead-checkout` sets `cancel_url: ${origin}/preview/${previewToken}` with no query string, so a buyer returning from a cancelled Stripe session loses `followup` / `vday10` / `promo`.
- Pricing is fully server-derived in `create-lead-checkout` (`_shared/lead-checkout.ts` constants). Client never sends an amount.
- Package on preview purchase requires the second version to already exist (`hasReadyLeadBonus`); rush is refused.
- `orders.notes` partial unique indexes that exist today (queried): `idx_orders_stripe_session_unique` on `notes LIKE 'stripe_session:%'`, `idx_orders_lead_session_unique` on `'lead_session:%'`, `idx_orders_paypal_order_unique` on `'paypal_order:%'`. **There is no index covering any new prefix**, so a `paypal_lead:%` key would be unenforced without a new index — uniqueness must be created, not assumed.
- `create-paypal-order` / `capture-paypal-payment` handle the new-song flow only: they require `formData`, cache metadata in `admin_settings` under `paypal_order:<id>`, and insert with `notes = paypal_order:<id>`. They have no concept of a lead, a preview token, or copying an existing song.
- Every paid rail hardcodes `device_type = "Web"` (see §8).

## 2. Work item A — cancellation roundtrip (ship first, independently)

Single behaviour: preserve the flags that arrived with the request.

- `create-lead-checkout`: build the cancel target with `URLSearchParams` from the **validated inbound values only** — `followup=true` only if the request carried it, `vday10=true` only if it carried it, `promo=<slug>` only for a slug that already passed the existing validation in this same request. Unknown or unvalidated keys are never echoed. Values are constructed server-side, not copied from a client-supplied URL.
- Redirect safety: the return path is assembled as a fixed path (`/preview/<token>` where token matched the existing `length >= 16` check) plus that param set, on a base URL that comes from an **allowlist** — a `SITE_URL` constant plus known preview host — rather than the raw `origin` header. Any unrecognised origin falls back to the canonical site URL. Same treatment for `success_url`.
- No pricing change: the resulting price on return is whatever the server already computes for those same flags today.

Tests (offline, pure): a unit-testable `buildLeadCancelUrl(token, flags, origin)` in `_shared/lead-checkout.ts` covering — no flags; followup only; vday10 only; validated promo slug; both; token/percent/ampersand injection attempts in the slug; a hostile `origin` header (`https://evil.test`) falling back to canonical; a hostile `origin` with an embedded newline or `@`; and confirmation that a client-supplied arbitrary key is dropped.

## 3. Work item B — PayPal on preview purchase (default off, source only until verified)

### Idempotency and atomicity — actual design

Three independent guards, none relying on a read-then-write:

1. **Provider key uniqueness.** New order key `notes = 'paypal_lead:<paypalOrderID>'` with a **new partial unique index** on `notes` where `notes LIKE 'paypal_lead:%'`. Insert is the claim; a `23505` means someone else won the race and we re-read and return their row. No pre-check is treated as authoritative (the existing pre-insert re-check stays only as a latency optimisation).
2. **Lead conversion claim.** Converting a lead becomes a conditional update, not check-then-write:
   `UPDATE leads SET status='converted', converted_at=now(), order_id=$order WHERE id=$lead AND status <> 'converted' AND order_id IS NULL RETURNING id`.
   Zero rows returned means another rail already converted this lead. The claim runs **before** the order insert is finalised as the customer's order; if the claim loses, the newly captured PayPal payment is recorded as a **duplicate payment on the existing order** (see 3) and no second order is created.
3. **Cross-provider convergence.** One lead can only ever produce one order because of guard 2. If a buyer pays on both rails (card fails → retries → both settle, or webhook + browser both land), the outcome is: exactly one order, exactly one converted lead, and a `duplicate_payment_detected` row in `order_activity_log` carrying provider, provider order/session id, and amount, plus an operator alert email through the existing Brevo alert helper. **No automatic refund, no automatic cancellation** — a human decides.

Guard 1 does not need a `leads` schema change. Guard 2 needs no new column. Guard 3 needs no new column — it uses the existing activity log. **Total schema additions: one partial unique index.** (If you'd rather store duplicate payments in a typed table instead of the activity log, that is a second, larger decision — flagging, not assuming.)

### Recovery that does not depend on the success page

The success page is treated as an accelerator, never the guarantee.

- **Approved-but-not-captured** (buyer closed the tab after approving on PayPal): a reconciliation pass lists `admin_settings` keys `paypal_lead_order:*` older than a few minutes with no matching order, fetches each PayPal order's status, and captures + converts any that are `APPROVED`. Same idempotent claims, so it is safe to run repeatedly and safe to run concurrently with a returning browser.
- **Captured but local write failed:** on `ORDER_ALREADY_CAPTURED`, or any capture whose local insert errors, the function re-fetches the PayPal order, reads the real captured amount, and completes the conversion. The same reconciliation pass covers rows where PayPal says `COMPLETED` but we have no order — the existing "favour broken records over silent drops" rule applies: create the order and alert, never drop.
- **Where the pass runs:** an authenticated admin/monitor-key entry point, invocable manually and schedulable later. It writes nothing customer-facing and sends no customer email.
- **Rollback independence:** recovery and capture are gated on **nothing**. The `lead_paypal_enabled` flag gates *creation of new PayPal orders only*. Turning it off must never orphan an already-approved payment, so capture and reconciliation stay live regardless of flag state.

### Validation on capture (server-only truth)

Before any order row is created:

- Capture `status === "COMPLETED"`.
- `currency_code === "USD"` — reject anything else and alert rather than converting.
- Captured amount is compared against the **server-recomputed** offer for that lead (base + package), read from the stored `paypal_lead_order:<id>` payload and re-derived from `_shared/lead-checkout.ts`. A mismatch does not silently accept: it creates the order (money was taken) at the *captured* amount, records the discrepancy in the activity log, and alerts.
- Lead identity comes only from the **server-stored** `leadId` in that payload, never from the client. Song, cover, bonus, lyrics all come from the lead row through the existing `buildLeadAssetPatch`; no asset URL or price is ever accepted from the client.
- Package entitlement is granted only when the lead's second version exists at capture time; if it disappeared between create and capture, the entitlement is still granted (they paid) and an alert fires.

### No blocking on a recent Stripe session

Explicitly dropped from the previous draft. A buyer whose card fails must be able to switch to PayPal immediately. Convergence is handled by the lead claim in guard 2, not by refusing to start.

### Existing flows must not regress

- `create-paypal-order`, `capture-paypal-payment`, `create-checkout`, `stripe-webhook`, `process-payment`, `process-lead-payment` are **not modified** by item B. The preview PayPal path lives in two new functions plus one shared helper extraction.
- If the shared eligibility/pricing logic is extracted from `create-lead-checkout` into `_shared/lead-checkout.ts` so both rails share one source of truth, the extraction is behaviour-identical and covered by unit tests that assert the same outputs as today for every branch (followup, vday10, targeted promo, sitewide floor, package on/off).

## 4. Files

Item A:
- `supabase/functions/_shared/lead-checkout.ts` — `buildLeadCancelUrl()`, allowlisted-origin resolver.
- `supabase/functions/create-lead-checkout/index.ts` — use them for `cancel_url` and `success_url`.
- `supabase/functions/_shared/lead-checkout_test.ts` — new unit tests.

Item B (all default-off / inert):
- `supabase/functions/_shared/lead-checkout.ts` — `resolveLeadOfferCents()` extraction.
- `supabase/functions/create-paypal-lead-order/index.ts` — new, refuses unless flag on.
- `supabase/functions/capture-paypal-lead-payment/index.ts` — new, never flag-gated.
- `supabase/functions/reconcile-paypal-lead-orders/index.ts` — new, key-authenticated.
- `supabase/config.toml` — entries for the new functions.
- `src/pages/SongPreview.tsx` — PayPal button, rendered only when the server reports the flag on.
- `src/pages/PaymentSuccess.tsx` — additive `source=lead-paypal` branch; existing branches untouched.
- `supabase/functions/get-lead-preview/index.ts` — expose `paypalEnabled`.
- `supabase/migrations/<ts>_paypal_lead_unique.sql` — **source only, unapplied**: partial unique index on `notes LIKE 'paypal_lead:%'`, plus `admin_settings` row `lead_paypal_enabled='false'`.

## 5. Verification (offline only)

1. Typecheck + `deno`/vitest unit tests on all pure helpers: cancel-URL builder, origin allowlist, offer resolver (branch-by-branch parity with current behaviour), amount/currency validator.
2. Mocked integration tests: PayPal HTTP calls and the database client are stubbed by fixtures. Scenarios — happy path; duplicate capture; `ORDER_ALREADY_CAPTURED` with and without a local order; approved-then-abandoned picked up by reconciliation; capture succeeded + insert throws; lead already converted by Stripe (must produce zero second orders and one duplicate-payment log row); non-USD currency; amount mismatch; package asset missing at capture; flag off blocking creation but **not** blocking capture/recovery.
3. Unique-index behaviour proven against a **local fixture Postgres**, not production: apply the index in a throwaway local database and assert that two concurrent inserts with the same `paypal_lead:` key yield exactly one row and one `23505`.
4. Nothing is deployed, no flag is enabled, no migration is applied, and no live payment of any kind is made until you review the results.

## 6. Rollout / rollback

1. Item A alone: review diff and tests, then deploy `create-lead-checkout` only. Behaviour change is limited to returning buyers keeping the flags they arrived with.
2. Item B source lands with the flag row absent/false; the button cannot render and creation refuses.
3. Apply the index migration only on your go-ahead.
4. Flip `lead_paypal_enabled` on when you choose; the first live PayPal preview payments are then real and monitored.
5. Rollback: flag to `false`. Creation stops; capture and reconciliation keep working so any in-flight approved payment still converges to an order. Already-paid orders keep entitlements because `get-song-page` reads columns, not flags. Reverting the frontend commit alone leaves a consistent backend. Index is additive and can stay.

## 7. Open items for you

- Duplicate payments: activity-log row + alert (my proposal) vs a dedicated table.
- Whether the follow-up flag should ever become eligibility-checked (separate decision; untouched here).
- Whether reconciliation should be scheduled or stay manual-only initially.

## 8. device_type finding (read-only, no change proposed)

- Real detection exists in only two places: `src/lib/orderService.ts` `getDeviceType()` (`Mobile` / `Desktop` from the user agent) feeding `create-order`, and `capture-lead` which stores the client-sent value or `"unknown"`.
- All paid rails hardcode the literal `"Web"`: `stripe-webhook` (both insert sites), `process-payment`, `process-lead-payment`, `capture-paypal-payment`. `admin-orders` manual conversion writes `"Manual Conversion"`.
- So there is **no `'desktop'` fallback biasing history**. The real distortion is the opposite: almost every paid order is labelled `"Web"`, and `FunnelInsights` drops only `"unknown"`, so the device split is dominated by a meaningless bucket while genuine Mobile/Desktop rows represent only the small `create-order` slice. Historical mobile-vs-desktop conclusions from that chart are unreliable.
- Secondary defect: `FunnelInsights` maps icons by lowercase keys while stored values are capitalised, so even real values may miss their icon.
- Past `"Web"` rows are unrecoverable; a fix would carry the detected device through checkout metadata into the paid inserts going forward. Not in this batch.
