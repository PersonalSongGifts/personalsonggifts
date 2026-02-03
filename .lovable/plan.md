
## Enable Promo Code Field for Lead Checkout

### Problem
When leads try to unlock their full song, the Stripe Checkout page doesn't have a promotion code input field. If you want to send them a special discount code later (like `FULLSONG` for $5 off), they have no way to enter it.

### Solution
Enable Stripe's built-in promotion code field on the lead checkout page by adding a single parameter to the checkout session configuration.

**Good news:** Stripe promotion codes are already case-insensitive by default - entering "fullsong", "FULLSONG", or "FullSong" will all work the same.

---

## Technical Changes

### File: `supabase/functions/create-lead-checkout/index.ts`

**Add one parameter** to the `stripe.checkout.sessions.create()` call:

```text
Before:
const session = await stripe.checkout.sessions.create({
  customer_email: lead.email,
  line_items: [...],
  mode: "payment",
  ...
});

After:
const session = await stripe.checkout.sessions.create({
  customer_email: lead.email,
  line_items: [...],
  mode: "payment",
  allow_promotion_codes: true,  // <-- ADD THIS LINE
  ...
});
```

This enables the promotion code redemption box in Stripe's hosted checkout UI.

---

## Existing Stripe Coupons Available

Your Stripe account already has these coupons configured:

| Coupon Name | Discount | Type |
|------------|----------|------|
| FULLSONG | $5 off | Fixed amount |
| VALENTINES50 | 50% off | Percentage |
| WELCOME50 | 50% off | Percentage |
| HyperdriveFREE2026 | 100% off | Percentage |
| HyperdriveFREE2026! | 100% off | Percentage |

To use these in the checkout field, each coupon needs a **promotion code** (customer-facing code) attached to it. The `FULLSONG` coupon exists, but I'll need to verify/create its promotion code so customers can actually type "FULLSONG" in the box.

---

## What Customers Will See

After this change, the lead checkout page will show a "Add promotion code" link that expands to a text input field. Customers can enter any valid promo code (case-insensitive), and Stripe will automatically apply the discount and show the updated total.

---

## Deployment

1. Update `create-lead-checkout/index.ts` with `allow_promotion_codes: true`
2. Deploy the edge function
3. Create promotion codes for any coupons that don't have them yet
4. Test with a lead preview to verify the promo code field appears
