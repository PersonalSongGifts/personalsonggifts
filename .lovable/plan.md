# Preview Checkout: Keep the Promised Discount + Add PayPal

Read-only inspection done. Nothing changed. Below is what the code does today, the narrow build, the risks, and a test boundary that does not touch real customers.

## 1. What the code does today (verified)

**Discount is only in the URL.** `src/pages/SongPreview.tsx` reads `?followup=true`, `?vday10=true`, `?promo=` from the address bar and passes them to `create-lead-checkout`. `create-lead-checkout` sets `cancel_url: ${origin}/preview/${previewToken}` — with **no query string**. So a buyer who opens the discounted link, clicks Buy, cancels on Stripe and comes back lands on the plain preview page and is quoted full price ($29 instead of $19). The follow-up email put "$10 off" in writing, so this is a promise-breaking bug, not a preference.

Pricing itself is already server-side and safe: `_shared/lead-checkout.ts` holds `LEAD_STANDARD_TOTAL_CENTS = 2900`, `FOLLOWUP_DISCOUNT_CENTS = 1000`, and `create-lead-checkout` re-derives the amount, applies the follow-up floor, validates targeted promos against `order_activity_log`, and applies any sitewide promo as a floor. The client never sends a price.

**Package on a preview purchase** is gated on the second version already existing (`hasReadyLeadBonus`), priced at `FOREVER_MEMORY_PACKAGE_CENTS = 2400`, and split back out at fulfilment by `resolveLeadCheckoutAmounts`. Rush is explicitly refused on preview purchases.

**Preview purchase has no PayPal.** `create-paypal-order` / `capture-paypal-payment` only understand the *new-song* checkout: they require `formData`, stash metadata in `admin_settings` under `paypal_order:<id>`, and on capture insert a brand-new order with `notes = paypal_order:<id>`. They know nothing about `previewToken`, leads, copying the existing song, or marking the lead converted. So PayPal cannot be reused as-is for the preview flow.

**Song unlock after payment** already depends only on a verified payment: Stripe path converts the lead in `process-lead-payment` (idempotent on `notes = lead_session:<session_id>`, plus the webhook covering the same key), copies the finished song onto the order via `buildLeadAssetPatch`, and sets `status = converted` on the lead.

## 2. What to build (narrow)

**A. Preserve the promised discount across cancel/return**
1. `create-lead-checkout`: build `cancel_url` from the same flags the request carried — re-append `followup=true`, `vday10=true`, `promo=<slug>` to `/preview/<token>`. No pricing logic changes.
2. `SongPreview.tsx`: also read the flags from `sessionStorage` (written once on first load, keyed by preview token) so a return from any route still quotes the promised price. The flags remain *hints only* — the server keeps deciding the price, so a hand-typed `?followup=true` still cannot beat the server's eligibility rules.
3. `create-lead-checkout`: when the follow-up flag is set, keep the existing floor behaviour and additionally never quote above `LEAD_STANDARD_FOLLOWUP_TOTAL_CENTS`; if a targeted promo has expired, fall back to the follow-up price rather than to full price.

**B. PayPal on preview purchase**
4. New function `create-paypal-lead-order`: input `{ previewToken, applyFollowupDiscount, applyVday10Discount, promoSlug, addons: { forever_memory } }`. It reuses the **exact** eligibility and pricing block from `create-lead-checkout` (extracted into `_shared/lead-checkout.ts` as one `resolveLeadOfferCents()` helper so the two rails can never diverge), refuses rush, refuses the package unless the second version already exists, creates the PayPal order, and stores metadata under `paypal_lead_order:<id>` including `leadId`, `previewToken`, `offerPriceCents`, `package_price_cents`.
5. New function `capture-paypal-lead-payment`: captures, requires `status = COMPLETED`, then performs the same conversion `process-lead-payment` does — same asset copy, same package entitlement split, same lead `converted` write, same activity log — keyed idempotently on `notes = paypal_lead:<orderID>`, with the existing `ORDER_ALREADY_CAPTURED` recovery and pre-insert re-check patterns copied from `capture-paypal-payment`.
6. `SongPreview.tsx`: a "Pay with PayPal" button beside the existing card button, mirroring `Checkout.tsx` (`window.location.href = https://www.paypal.com/checkoutnow?token=<id>`), with `return_url = /payment-success?source=lead-paypal`.
7. `PaymentSuccess.tsx`: when `source=lead-paypal` and `?token=` is present, call `capture-paypal-lead-payment` instead of `capture-paypal-payment`.
8. Whole PayPal-on-preview path sits behind `admin_settings.lead_paypal_enabled` (default `false`), read server-side and echoed by `get-lead-preview` so the button only renders when the server says so.

**Other existing-song upsells (bonus, download, lyrics, package, tips, rush):** all are Stripe-only single-line checkouts against an existing order. Adding PayPal there needs the same two-function pattern per upsell (create + capture + entitlement claim) because entitlement writes are per-column and idempotent per session id. Reusable *pattern*, not reusable *code*. Recommendation: ship preview PayPal first, measure, then decide — no work on those in this batch.

## 3. Adversarial risks and how each is closed

- **Double order across rails** (buyer opens Stripe and PayPal): two different idempotency keys, so both could produce an order. Close by claiming the lead itself: capture refuses if `leads.status = 'converted'`, and the Stripe path already refuses too. Also refuse `create-paypal-lead-order` when a Stripe session for that lead was created in the last few minutes.
- **Duplicate capture / retried capture:** `notes = paypal_lead:<orderID>` unique key + `ORDER_ALREADY_CAPTURED` recovery + pre-insert re-check, exactly as the current PayPal function does.
- **Paid but no order** (network death mid-capture): `PaymentSuccess` retries; capture is idempotent; keep the "favour broken records over silent drops" rule and the operator alert used by `process-lead-payment`.
- **Package paid but second version missing:** refuse the package at both create *and* capture; if it vanishes between the two, still create the order and record the package entitlement (the buyer paid) and alert support rather than silently dropping it.
- **Expired promo at return:** price falls back to the follow-up price, never above it, and the UI shows the honest number rather than a stale badge.
- **Client-forged discount flags:** server ignores them except as eligibility *requests*; targeted promos still require the logged send.
- **Wrong lead/song bought:** identity comes only from `previewToken` server-side; the asset copy uses the same `buildLeadAssetPatch` so the buyer gets the exact song they heard.
- **PayPal cannot do $0:** free carts stay on the card rail (already the case).

## 4. Deployment reality — important

Edge functions in this project **deploy automatically when the file is saved**, and there is a **single shared backend** serving both the preview and the live site. "Do not publish" protects the *frontend* only. So any backend edit in the build step is live for real customers the moment it lands. That forces the design above: every new behaviour is either (a) additive and behaviour-neutral, or (b) behind `lead_paypal_enabled = false`.

Also note: PayPal here uses the **live** API (`api-m.paypal.com`) and Stripe uses a **live** secret key. There is no sandbox rail configured, so any end-to-end payment test is a real charge.

## 5. Safe test boundary (no customer mutations, no meaningful money)

1. Typecheck + unit tests on the pricing helper — pure functions, zero side effects.
2. Create one throwaway lead through the normal capture path using an internal email, and test against **that** preview token only.
3. Add `admin_settings.lead_checkout_test_emails`; for those emails only, the server prices the offer at the $0.50 floor. So the real charge in a live test is 50 cents on the owner's own card/PayPal account, refundable, and it can never apply to a customer email.
4. Cancel/return test needs no payment at all: create the session, abandon it, confirm the return URL still quotes the discounted price.
5. Read-only verification afterwards: query the created test order, confirm one row, correct split, lead converted, song copied. Then dismiss/cancel the test order.
6. No emails: keep automation/delivery flags as they are; the test lead's song already exists so nothing is generated.

## 6. Files touched

- `supabase/functions/_shared/lead-checkout.ts` — extract `resolveLeadOfferCents()`, test-email floor helper.
- `supabase/functions/create-lead-checkout/index.ts` — discount-preserving `cancel_url`, follow-up ceiling, use shared resolver.
- `supabase/functions/get-lead-preview/index.ts` — expose `paypalEnabled`.
- `supabase/functions/create-paypal-lead-order/index.ts` — new.
- `supabase/functions/capture-paypal-lead-payment/index.ts` — new.
- `supabase/config.toml` — `verify_jwt = false` for the two new functions.
- `src/pages/SongPreview.tsx` — flag persistence + PayPal button.
- `src/pages/PaymentSuccess.tsx` — `source=lead-paypal` capture branch.
- Migration: insert `lead_paypal_enabled=false`, `lead_checkout_test_emails=''`.

## 7. Rollout and rollback

1. Ship A (discount preservation) alone; it is behaviour-neutral except that returning buyers now see the price they were promised.
2. Ship B with `lead_paypal_enabled=false`; nothing renders, nothing changes.
3. Run the 50-cent live test on the throwaway lead; verify rows read-only.
4. Flip the flag on; watch the first handful of PayPal preview orders.
5. Rollback: flip the flag back to `false` — the button disappears and new PayPal sessions are refused, while any already-paid PayPal order keeps its order row and entitlements (the song page reads columns, not flags). Reverting the frontend commit alone leaves a consistent backend. No destructive migration; new settings rows only.

## 8. device_type answer (read-only finding)

- Real detection happens in **only two places**: `src/lib/orderService.ts` `getDeviceType()` (returns `Mobile` or `Desktop` from the user agent) feeding `create-order`, and `capture-lead` which stores the client-sent value or `"unknown"`.
- **Every paid rail hardcodes the literal string `"Web"`**: `stripe-webhook` (both insert sites), `process-payment`, `process-lead-payment`, `capture-paypal-payment`. `admin-orders` manual conversion writes `"Manual Conversion"`.
- So there is **no `'desktop'` fallback biasing anything** — the actual distortion is the opposite: nearly all paid orders are labelled `"Web"`, so the Admin device split (`FunnelInsights`, which drops only `"unknown"`) is dominated by a meaningless bucket and the genuine Mobile/Desktop rows represent only the small `create-order` slice. Any historical mobile-vs-desktop conclusion drawn from that chart is unreliable.
- There is also a casing mismatch (`Mobile`/`Desktop` vs lowercase icon keys in `FunnelInsights`), so even real values may not map to their icons.
- Fix would be to carry the detected device through checkout metadata into all paid inserts, and backfill nothing (past `"Web"` rows are unrecoverable). Not included in this batch — flagging only.
