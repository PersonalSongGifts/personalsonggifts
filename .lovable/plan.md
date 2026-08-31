# Checkout & Fulfillment Improvements — Inspection + Safe Rollout Plan

Advice only. Nothing was changed. Base price stays $29.

## 1. Current behavior (verified in code / DB)

**Base + add-on checkout (Stripe)** — `supabase/functions/create-checkout/index.ts`
- `BASE_SONG_PRICE_CENTS = 2900`. Legacy `BASE_PRICES.priority = 15999` with `SEASONAL_DISCOUNT_PERCENT = 50` is still live for `pricingTier: "priority"` (~$79.99) even though the UI no longer sells it.
- Add-ons already exist: `addons.forever_memory` → `PACKAGE_ADDON_PRICE_CENTS` line item, `addons.rush` → `RUSH_PRICE_CENTS` (1000). Both write `metadata.package_price_cents` / `rush`, `rush_price_cents`, and total to `metadata.amount_total_cents`.
- `allow_promotion_codes` is suppressed when an add-on or promo slug is present.

**Base + add-on checkout (PayPal)** — `create-paypal-order/index.ts`
- Mirrors the same constants locally (`BASE_SONG_PRICE_CENTS = 2900`, `PACKAGE_ADDON_PRICE_CENTS = 2400`, `RUSH_PRICE_CENTS = 1000`) and stashes the whole order payload into `admin_settings` under `paypal_order:<id>` (visible in the table today).

**Order creation + entitlement writes**
- Stripe: `stripe-webhook/index.ts` — order insert for `checkout.session.completed`, plus separate branches for `entitlement === "lyrics_unlock"`, `"bonus_unlock"`, `type/entitlement === "package_unlock"` (which also back-fills `lyrics_unlocked_at`, `download_unlocked_at`, `bonus_unlocked_at` at 0 cents), and `"rush_upgrade"`.
- PayPal: `capture-paypal-payment/index.ts` writes the order **and** the package/rush fields inline (`package_unlocked_at`, `lyrics_unlocked_at`, `download_unlocked_at`, `bonus_unlocked_at`, `rush_addon`).
- Post-purchase upsell checkouts: `create-package-checkout` ($24, `PACKAGE_PRICE_CENTS = 2400`), `create-bonus-checkout` (default 1999, override via `admin_settings.bonus_song_price_cents = 1999` or `promotions.bonus_price_cents`), `create-lyrics-checkout`, `create-download-checkout`, `create-rush-upgrade` (**699**).
- Browser-side verifiers exist in parallel with the webhook: `verify-package-purchase`, `verify-lyrics-purchase`, `verify-download-purchase`, `verify-bonus-purchase`, `verify-rush-upgrade`. All use `.is(<field>, null)` guards, so webhook + browser are idempotent per entitlement.

**Bonus song generation** — `automation-generate-audio/index.ts` fires the bonus Suno task alongside the primary song whenever `admin_settings.bonus_song_enabled !== "false"` (currently `true`), independent of purchase. `bonusOnly: true` regenerates just the bonus. `automation-suno-callback` owns `bonus_automation_status` (`audio_generating` → `completed` / `failed`) and `bonus_notified_at`.

**Cover art** — `generate-album-cover` / `check-album-cover` (Kie Jobs, GPT Image 2), surfaced by `AlbumCoverStudio.tsx` / `CoverStudio.tsx`, columns `album_cover_url|status|task_id` and `album_cover_bonus_*`.

**Song page** — `get-song-page/index.ts` returns `package_unlocked`, `lyrics_unlocked`, `download_unlocked`, `bonus_*` and cover fields; `SongPlayer.tsx` renders paywalls from those flags.

**Lead-preview flow** — `create-lead-checkout` ($2900 both branches after the parity fix) → `process-lead-payment` copies lead assets onto the order. It sells **no** package and **no** rush today; `SongPreview.tsx` has no add-on UI. That already satisfies "don't sell rush where the song is instant".

## 2. Contradictions to surface (no pricing change in this task)

1. **Rush price mismatch:** $10.00 at checkout vs **$6.99** in `create-rush-upgrade`. Same product, two prices.
2. **Rush promise is a guarantee, not an estimate:** copy says "1-Hour Express", "Within 1 hour", "Upgrade this order to arrive within 1 hour", while `stripe-webhook` schedules `created_at + 30min + up to 15min jitter` and the global 30-minute delivery floor applies. Needs "usually ready in about an hour".
3. **Package vs à-la-carte:** bonus alone is $19.99, lyrics $4.99, download $19.99 — the $24 package dominates them; the standalone ladder is now mostly dead weight and can confuse.
4. **Legacy priority tier ($79.99) is still reachable** by posting `pricingTier: "priority"` to either checkout function.
5. **Package copy already promises a printable lyric keepsake and custom album cover** (`create-checkout` line-item description) — confirm every promised artifact actually ships before widening the offer.
6. `admin_settings` is doubling as a PayPal payload cache (`paypal_order:*`) — it makes any settings-based flag reads noisy.

## 3. Server-side source of truth (keep this invariant)

| Concern | Stripe | PayPal |
|---|---|---|
| Price | recomputed in `create-checkout` from server constants; `session.amount_total` is canonical after payment | recomputed in `create-paypal-order`; captured amount from PayPal capture response |
| Payment state | `checkout.session.completed` + `session.payment_status` | PayPal capture status in `capture-paypal-payment` |
| Entitlement state | `orders.{package,lyrics,download,bonus}_unlocked_at`, `rush_addon` | same columns |
| Fulfillment state | `orders.automation_status`, `bonus_automation_status`, `album_cover_status`, `sent_at`, `delivery_status` | same |

Client never asserts entitlement; it only reads `get-song-page`.

## 4. Failure modes to design for

- Webhook/browser race on the same entitlement → already mitigated by `.is(null)` guards; keep that pattern for any new write and keep `logActivity` gated on the row actually being claimed.
- Duplicate Stripe events / retried webhook → idempotent by session id; a 500 is intentionally returned so Stripe retries.
- Payment succeeded but order missing (past incident under DB saturation) → keep `process-payment` / `capture-paypal-payment` reconciliation path and the "favor broken records over silent drops" rule.
- **Package paid but bonus failed/absent** → currently nothing blocks the sale on `bonus_automation_status = 'failed'`. Needs an availability gate + a clear "still being made" state, not a false "ready".
- Lyrics double-charge → `create-lyrics-checkout` guards only on `lyrics_unlocked_at`; because package back-fills it, this holds *only if* the package write always lands. Add an explicit `package_unlocked_at` guard to lyrics/download/bonus checkout functions as belt-and-braces.
- Rush after delivery → already auto-refunds; keep.
- Stale UI: song page flags cached → keep cache-busting; re-fetch after any verify call.
- Email duplication → `delivery_status` row-lock pattern and `bonus_notified_at` must stay the single writers.
- Refunds/cancellations do not clear `*_unlocked_at`; admin has no un-entitle action.
- Admin visibility gaps: no single "package fulfillment" view (package paid + bonus status + cover status + lyrics) — CS cannot answer "is their package complete?" in one place.

## 5. Recommended sequence (feature-flagged, preview-testable)

Flag store: `admin_settings` keys read server-side, never trusted from the client.
- `package_offer_enabled` (default `false`) — gates *new* sales only.
- `package_offer_requires_bonus_ready` (default `true`) — refuse the sale when the order has no bonus asset and `bonus_automation_status` is `failed`.
- `rush_offer_enabled` + `rush_price_cents` (single source, replacing the two hardcoded constants).
- `package_offer_allowlist_emails` — preview-test with `admin_tester_emails`-style allowlist before public rollout.

Order of work:
1. **Read-only observability first** — admin panel showing package fulfillment state per order; no customer-facing change.
2. **Server guards** — availability + already-owned guards in `create-package-checkout`, `create-checkout`, `create-paypal-order`, and the lyrics/download/bonus checkouts. Behavior-neutral when the flag is off.
3. **Single rush price + honest copy** — one constant/flag, "usually ready in about an hour" everywhere.
4. **Flagged UI** — package card and package state on `Checkout.tsx`, `PaymentSuccess.tsx`, `SongPlayer.tsx` behind the flag + allowlist. Never render the package on `SongPreview.tsx`/lead flow.
5. **Turn the flag on for allowlist → then public.**

## 6. Acceptance tests (all must pass pre-deploy)

Stripe test mode:
1. $29 only → order created once, no entitlements.
2. $29 + package → one session, `amount_total = 5300`; package/lyrics/download/bonus all unlocked, `package_price_cents = 2400`.
3. Package purchased post-purchase via `create-package-checkout` → same end state, one `package_unlocked` activity row.
4. Replay `checkout.session.completed` twice → no duplicate entitlement, no duplicate email, one activity row.
5. Refresh the success URL 5× → `verify-package-purchase` stays idempotent.
6. Order already owning package → `create-lyrics-checkout` / `create-download-checkout` / `create-bonus-checkout` return `alreadyUnlocked`, never a payable session.
7. Rush: price identical in checkout and post-purchase; rush after `sent_at` → auto-refund path fires.
8. Bonus `failed` order → package offer hidden and `create-package-checkout` refuses (with flag on).
9. Flag off → checkout, success page, and song page render exactly as today; previously sold package orders still show full entitlements.

PayPal sandbox: repeat 1, 2, 4 (double capture), 6, plus declined-instrument recovery and the duplicate-capture unique index still holding.

Lead flow: preview → paid conversion shows no package/rush offer and no false discount badge.

## 7. Rollback design

- Flipping `package_offer_enabled` to `false` hides the offer and blocks new sessions but changes **no** `*_unlocked_at` data, so already-sold packages keep every entitlement (`get-song-page` reads columns, not the flag).
- All new server guards are additive early-returns; reverting the frontend commit alone leaves a consistent backend.
- No destructive migration: any new column is nullable with a default, and no existing column is renamed or dropped.

## 8. Smallest safe first batch

1. Migration: insert flag rows (`package_offer_enabled=false`, `package_offer_requires_bonus_ready=true`, `rush_price_cents=1000`) — inert while `false`.
2. `create-package-checkout`: add already-owned + bonus-availability guards and flag check (no-op for current traffic since the offer is already live only where it is today).
3. Add `package_unlocked_at` guards to `create-lyrics-checkout`, `create-download-checkout`, `create-bonus-checkout` — closes the double-charge hole with zero UI change.
4. Read-only admin "Package fulfillment" column/section.

No pricing change, no customer-visible change in this batch.
