

## Surface upsell revenue across the admin dashboard

Today the dashboard's "Total Revenue" only counts the base order `price`. Lyrics unlocks show their own line item, but **bonus track unlocks** ($X) and **download/usage rights unlocks** ($19.99) are completely invisible. That's why the dashboard total is lower than what Stripe + PayPal report — Stripe sees every charge (base + every upsell), the dashboard only sees base orders.

This plan fixes both halves of your message: **(1) make total revenue match Stripe/PayPal**, and **(2) add visual breakdowns of upsell performance over time.**

### 1. Include all upsells in revenue totals

Update the revenue math so every revenue stat = `base price + lyrics_price_cents + download_price_cents + bonus_price_cents` (cents-safe, comped unlocks where `*_price_cents = 0` are excluded automatically).

Affected stats in `StatsCards.tsx`:
- **Total Revenue** + Stripe/PayPal split
- **Revenue Today** + Stripe/PayPal split
- True Recovery Revenue (also rolls in upsells from recovered orders)

A new sub-line under Total Revenue will show the breakdown so you can sanity-check against Stripe:
> *Base $X · Lyrics $Y · Downloads $Z · Bonus $W*

### 2. Add the missing upsell data to the API

`admin-orders` currently returns `lyrics_price_cents` and `bonus_price_cents` but **not** `download_unlocked_at` / `download_price_cents`. Add those two columns to the SELECT in `supabase/functions/admin-orders/index.ts` (both the analytics fetch and the paginated fetch).

### 3. New "Upsell Revenue" chart on the Analytics tab

Add a new component `UpsellRevenueChart.tsx` next to the existing Revenue chart. It shows a **stacked area chart over the last 30 days** with three series:
- Lyrics Unlocks (purple)
- Download / Usage Rights (blue)
- Bonus Tracks (gold)

Each day bucket uses the unlock timestamp (`lyrics_unlocked_at`, `download_unlocked_at`, `bonus_unlocked_at`) — not `created_at` — so the chart reflects when the upsell revenue actually came in. Comped unlocks (`price_cents = 0`) are excluded.

Header shows 30-day totals per stream, e.g.:
> **Upsell Revenue (30d):** $1,240 · 87 lyrics · 24 downloads · 12 bonus

### 4. New "Upsell Performance" stat group

Add a fourth stat row in `StatsCards.tsx` so the upsell numbers are visible without scrolling to the chart:

| Card | Value | Sub-line |
|------|-------|----------|
| Lyrics Unlocks | `$X` | `N paid · M comped` |
| Download Unlocks | `$X` | `N customers · attach rate Y%` |
| Bonus Track Unlocks | `$X` | `N paid · M comped` |
| Total Upsell Revenue | `$X` | `Y% of total revenue` |

Attach rate = paid unlocks ÷ delivered orders eligible for that upsell.

### Why this will reconcile with Stripe

Stripe's total = base order charges + lyrics unlock charges + download charges + bonus unlock charges + (PayPal mirrored). After this change, our dashboard total uses the exact same components, all sourced from `*_price_cents` fields populated by the Stripe webhook from `session.amount_total` (your canonical pricing standard). The only legitimate gap left should be Stripe fees — which the dashboard intentionally shows as gross.

### Files to change

- **Edit** `supabase/functions/admin-orders/index.ts` — add `download_unlocked_at, download_price_cents` to both `orderColumns` strings
- **Edit** `src/components/admin/StatsCards.tsx` — update revenue math to include all upsells; add new "Upsell Performance" stat group; add `download_*` and `bonus_*` to the `Order` interface
- **New** `src/components/admin/UpsellRevenueChart.tsx` — stacked 30-day area chart
- **Edit** `src/pages/Admin.tsx` — render `<UpsellRevenueChart>` in the Analytics tab grid; add `download_unlocked_at` / `download_price_cents` to the `Order` interface

### Out of scope (flag for later if you want)

- Refunds: if you process refunds in Stripe, those aren't reflected anywhere in our DB today, so the dashboard will still slightly overstate vs. Stripe net. Could add a `refunded_at` / `refunded_amount_cents` flow later.
- Per-day drilldown table for upsells (the new chart + stat cards should cover the immediate need).

