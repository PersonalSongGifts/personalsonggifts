

## Fix: ADMINTEST99 Not Applied in PayPal Checkout

### Root Cause

The `create-paypal-order` edge function is missing the `DISCOUNT_TEST_CODES` handling that was added to `create-checkout` (Stripe). When `ADMINTEST99` is used:

1. It's **not** in `FREE_TEST_CODES` (correct — we want a real charge)
2. It falls through to the `else` branch, which tries to look it up as a **Stripe coupon**
3. Stripe doesn't have an `ADMINTEST99` coupon, so `stripeCoupon` is `null`
4. Result: **full price** is charged with no discount applied

The Stripe `create-checkout` function has the fix (lines 241-248 with `DISCOUNT_TEST_CODES`), but `create-paypal-order` was never updated with this same logic.

### Fix

**`supabase/functions/create-paypal-order/index.ts`**
- Add `DISCOUNT_TEST_CODES` map (same as in `create-checkout`)
- Add an `else if (DISCOUNT_TEST_CODES[upperAdditional])` branch before the generic Stripe coupon lookup, calculating the 99% discounted price

This is a one-line map addition + a ~5 line conditional block insertion.

