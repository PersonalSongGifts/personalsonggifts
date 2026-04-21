

## FLASH20 Targeted Promo Fix — Final Plan

Convert FLASH20 from a global promo to a targeted-only promo. Site-wide pricing (Early Mother's Day at $29.99) stays completely untouched. Only leads who actually received the flash20 email can redeem $19.99 via their personal preview link.

### 1. Schema change

Migration on `promotions`:
- Add `targeted boolean NOT NULL DEFAULT false`
- `UPDATE promotions SET targeted = true WHERE slug = 'flash20'`

### 2. `get-active-promo` — exclude targeted promos

Add `.eq("targeted", false)` to the query. Result: homepage banner, public checkout, bonus pricing all keep showing Early Mother's Day. FLASH20 never surfaces to the public.

### 3. `create-lead-checkout` — strict server-side gate for `flash20`

When `promoSlug === 'flash20'`:
1. Fetch promo row → must have `is_active = true` AND `targeted = true` AND `starts_at <= now() <= ends_at`
2. Verify lead has a `flash20_sent` entry in `order_activity_log` (`entity_type='lead'`, `entity_id = lead.id`)
3. **Expiry handling (per feedback):** if the promo exists but `ends_at < now()`, reject with a distinct error code `promo_expired` (different from `promo_not_eligible`). Frontend shows: *"This $19.99 flash sale has ended. Your song is still available at standard pricing."*
4. If lead never got the email → reject with `promo_not_eligible` → frontend shows standard $39.99/$49.99 pricing with no mention of the flash deal
5. On success → checkout uses `lead_price_cents` (1999) from the promo row

### 4. `SongPreview.tsx` — gate UI on server eligibility, not URL param

- Extend `get-lead-preview` to return `flash20Eligible: boolean` (true only if promo active+targeted+unexpired AND lead has `flash20_sent` log entry)
- $19.99 price, "72-hour flash sale" copy, and countdown only render when `flash20Eligible === true`
- If `?promo=flash20` in URL but ineligible → page renders normally with standard lead pricing, no flash UI anywhere
- If promo expired → small inline notice: *"The flash sale has ended — your song is still available."* + standard pricing

### 5. `admin-promos` + `PromosPanel.tsx` — visual + safety

- `admin-promos` returns `targeted` field
- Add `Targeted` badge next to targeted promos in the list
- Activate confirmation dialog for targeted promos changes to:
  > *"This will activate the FLASH20 targeted promo. Only leads who received the flash20 email can redeem $19.99 — site-wide pricing will NOT change."*
- Non-targeted promos keep the existing site-wide warning copy

### 6. Email CTA unchanged

`https://personalsonggifts.com/preview/{token}?promo=flash20` — one click, no manual code entry. Token identifies the lead; server-side gate enforces eligibility.

### What stays unchanged

- Early Mother's Day promo, banner, and public pricing — untouched
- `Flash20RemarketingPanel` sender/canary/countdown/stats — no logic changes
- 72h activation timing on first send — unchanged
- Audience filter, email content, atomic claim logic — unchanged

### Files

**Migration:**
- Add `targeted` column + flag FLASH20 as targeted

**Edge functions:**
- `supabase/functions/get-active-promo/index.ts` — filter `targeted = false`
- `supabase/functions/create-lead-checkout/index.ts` — flash20 eligibility + log check + graceful `promo_expired` vs `promo_not_eligible`
- `supabase/functions/get-lead-preview/index.ts` — return `flash20Eligible`
- `supabase/functions/admin-promos/index.ts` — return `targeted` field

**Frontend:**
- `src/pages/SongPreview.tsx` — gate flash UI on server eligibility, handle expired state
- `src/components/admin/PromosPanel.tsx` — Targeted badge + targeted-promo dialog copy

### After this ships

Activate flow: Promos panel → activate FLASH20 → dialog says "site-wide pricing will NOT change" → confirm → open Flash20 panel → send canary → review → release full batch → 72h clock runs → checkout works only for emailed leads → expired clicks get a clean message → Early Mother's Day keeps running for everyone else.

