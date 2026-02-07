
# Stackable Promo Codes via Stripe Coupon Lookup

## What Changes

The seasonal promo (VALENTINES50 at 50% off) will always be applied as the base discount. Any additional promo code the customer enters will stack on top by looking it up in Stripe's coupon system. This means you can create coupons in Stripe (like NEAL10 for $10 off) and they'll just work -- no code changes needed.

### Example: NEAL10 stacking on Valentine's promo (Standard tier)
- Base price: $99.99
- Valentine's 50% off: -$50.00 = $49.99
- NEAL10 $10 off: -$10.00 = **$39.99**

### Example: NEAL10 stacking on Valentine's promo (Priority tier)
- Base price: $159.99
- Valentine's 50% off: -$80.00 = $79.99
- NEAL10 $10 off: -$10.00 = **$69.99**

---

## New Backend Function: `validate-promo-code`

A new backend function that looks up a coupon code in Stripe and returns the discount details.

**Input**: `{ code: "NEAL10" }`

**What it does**:
1. Calls Stripe's Coupon API to find the coupon by name/ID
2. If found and valid, returns `{ valid: true, type: "amount_off", amount: 1000, name: "NEAL10" }` (or `type: "percent_off"` with the percentage)
3. Also checks the existing hardcoded codes (HYPERDRIVETEST, HYPERDRIVEFREE2026, etc.) so those still work for testing
4. If not found anywhere, returns `{ valid: false }`

This way, any coupon you create in Stripe's dashboard is instantly usable -- no code deploy needed.

---

## Frontend Changes (Checkout page)

**Promo code validation**:
- When a user clicks "Apply", call the new `validate-promo-code` function instead of checking the hardcoded list
- Show the returned discount info (dollar amount or percentage)

**Price display (stacked discounts)**:
- Always show the seasonal discount line (e.g., "VALENTINES50 Discount (50% Off): -$50.00")
- When an additional code is applied, show a second discount line (e.g., "NEAL10 Discount: -$10.00")
- The Total reflects both discounts stacked

**Stacking logic**:
- Seasonal percentage discount is applied first (to the base price)
- Additional coupon discount is applied second (to the already-reduced price):
  - Fixed amount coupons: subtract the dollar amount
  - Percentage coupons: apply the percentage to the already-discounted price
- Final price has a floor of $0 (can't go negative)

---

## Backend Changes (create-checkout function)

**Price calculation**:
1. Apply the seasonal discount first (50% off base price)
2. If an additional promo code is provided, look it up in Stripe and apply on top
3. The final `unit_amount` sent to Stripe reflects the fully stacked price
4. Store the additional promo code in session metadata for record-keeping

**Hardcoded test codes**:
- HYPERDRIVETEST, HYPERDRIVEFREE2026, and HYPERDRIVEFREE2026! (100% off) will still work as full overrides (price = $0)
- All other codes go through the Stripe lookup + stacking logic

---

## Files Changed

| File | What Changes |
|------|-------------|
| `supabase/functions/validate-promo-code/index.ts` | **New file** -- looks up coupons in Stripe API, returns discount info |
| `src/pages/Checkout.tsx` | Replace hardcoded validation with API call; update price display to show stacked discounts; update stacking math |
| `supabase/functions/create-checkout/index.ts` | Add Stripe coupon lookup for stacking; update price calculation to apply seasonal + additional discount |

## What Does NOT Change

- The seasonal promo auto-apply logic (VALENTINES50 before Feb 15, WELCOME50 after)
- The lead checkout flow (already uses `allow_promotion_codes: true` in Stripe)
- Order creation, webhook processing, or delivery logic
- No database changes
- No new dependencies

## After This Is Deployed

To add a new coupon for any customer, you just:
1. Create the coupon in Stripe (like you did with NEAL10)
2. Tell the customer the code
3. They enter it on checkout and it stacks automatically with the seasonal promo

No code changes needed for new coupons.
