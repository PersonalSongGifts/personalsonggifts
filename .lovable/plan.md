

## Updated Acoustic Bonus Track Upsell Plan — With Promo Pricing + Admin Analytics

This incorporates all three additions into the previously approved plan.

### Addition 1: Bonus Price in Promotions

**Database**: Add `bonus_price_cents` (integer, nullable) to the `promotions` table via migration.

**`admin-promos/index.ts`**: Include `bonus_price_cents` in the upsert action alongside the other price fields.

**`PromosPanel.tsx`**: Add a `bonus_price_dollars` field to the promo form, right after the lead price input. Same dollar-to-cents conversion pattern as the other three prices. Nullable — if left blank, no bonus discount during that promo.

**`get-active-promo/index.ts`**: Add `bonusPriceCents: data.bonus_price_cents` to the response object.

**`useActivePromo.tsx`**: Store `bonusPriceCents` from the promo response.

**`create-bonus-checkout/index.ts`** (new function): Before creating the Stripe session, call `get-active-promo` (or query `promotions` directly). If an active promo exists with a non-null `bonus_price_cents`, use that as the price. Otherwise fall back to `admin_settings.bonus_song_price_cents` (default 1999 = $19.99).

**`SongPlayer.tsx`**: The bonus unlock section checks the active promo. If `bonusPriceCents` is set, show it as the current price with a strikethrough on $19.99. Same visual pattern as the primary song pricing.

### Addition 2: Admin Analytics for Bonus Unlocks

**New component `src/components/admin/BonusTrackAnalytics.tsx`**:
- Query orders via `admin-orders` to get bonus-related fields
- Show key metrics: total bonus songs generated, total unlocked, unlock rate (unlocked / generated), total bonus revenue
- A small table/list of recent bonus unlocks: order short ID, customer email, unlock date, amount paid
- Reuse existing chart patterns (e.g., similar to `RevenueChart` or `AOVChart`)

**`admin-orders/index.ts`**: Ensure the order select includes all `bonus_*` columns so the admin frontend can compute stats.

**`src/pages/Admin.tsx`**: Add `BonusTrackAnalytics` component to the Analytics tab, alongside existing charts.

### Addition 3: Bonus Tracking in Admin Orders View

Already in the approved plan — each order card in admin shows: bonus generation status badge, unlocked status, unlock date, payment amount.

### Summary of ALL Files (full plan including previous approvals)

| File | Change |
|------|--------|
| **Migration SQL** | Add ~13 columns to `orders`, ~9 to `leads`, `bonus_price_cents` to `promotions`, insert `bonus_song_enabled` + `bonus_song_price_cents` admin settings |
| **`automation-generate-audio/index.ts`** | Fire bonus Suno call in parallel with primary (acoustic prompt, same lyrics, skip free orders) |
| **`automation-suno-callback/index.ts`** | Route callbacks by taskId (primary vs bonus). 180s min duration. Hold delivery until both ready. 30-min failsafe. |
| **`process-scheduled-deliveries/index.ts`** | 30-min bonus failsafe in stuck recovery |
| **`get-song-page/index.ts`** | Return bonus fields + shared lyrics unlock |
| **`get-active-promo/index.ts`** | Add `bonusPriceCents` to response |
| **`admin-promos/index.ts`** | Handle `bonus_price_cents` in upsert |
| **`stripe-webhook/index.ts`** | Add `bonus_unlock` early-return handler |
| **`send-song-delivery/index.ts`** | P.S. line about acoustic version (no subject change) |
| **`admin-orders/index.ts`** | Include bonus columns in order queries |
| **`create-bonus-checkout/index.ts`** | New — Stripe checkout for bonus, with promo price support |
| **`verify-bonus-purchase/index.ts`** | New — verify Stripe session, set `bonus_unlocked_at` |
| **`src/pages/SongPlayer.tsx`** | Bonus preview player, promo-aware pricing with strikethrough, unlock button, shared lyrics |
| **`src/components/admin/PromosPanel.tsx`** | Add bonus price field to promo form |
| **`src/components/admin/BonusTrackAnalytics.tsx`** | New — bonus unlock metrics + recent unlocks table |
| **`src/pages/Admin.tsx`** | Add BonusTrackAnalytics to Analytics tab, bonus columns to order cards |
| **`src/hooks/useActivePromo.tsx`** | Store `bonusPriceCents` |

Everything else from the previously approved plan remains unchanged: parallel generation, 30-minute failsafe, concurrency bypass, hardcoded acoustic prompts per gender, skip free/test orders, delivery hold logic, revision regeneration, and the upsell copy ("warm, intimate, and full of feeling").

