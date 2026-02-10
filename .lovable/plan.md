

# Fix Promo Codes on Lyrics Checkout

## The Problem
The ADMINLYRICS **coupon** exists in Stripe, but no **promotion code** was created for it. Stripe's `allow_promotion_codes: true` only works with promotion codes, not raw coupon IDs. These are two separate objects in the payment system.

## Immediate Fix (No Code Change)
In your payment provider's coupon settings for ADMINLYRICS, click the "+" next to "Promotion codes" and create a promotion code with the code text set to "ADMINLYRICS". This takes 10 seconds and the checkout will work immediately.

## Recommended Code Improvement (Belt and Suspenders)
To prevent this confusion in the future, update `create-lyrics-checkout` to also accept an optional promo/coupon code from the frontend, validate it server-side, and apply it directly as a discount -- falling back to Stripe's native promo code input for other codes.

### Changes

**`supabase/functions/create-lyrics-checkout/index.ts`**
- Accept optional `promoCode` in the request body
- If provided, look up the coupon in Stripe (by ID or by name, same logic as `validate-promo-code`)
- If found, use `discounts: [{ coupon: couponId }]` instead of `allow_promotion_codes`
- If not provided, keep `allow_promotion_codes: true` as the default so customers can still enter codes on the Stripe page

**`src/pages/SongPlayer.tsx`** (or wherever the lyrics unlock button lives)
- Add an optional promo code text input above the "Unlock Lyrics" button
- Pass the code to the `create-lyrics-checkout` function if entered

### Technical Detail

```text
Server-side flow:
1. Receive { orderId, promoCode? }
2. If promoCode provided:
   a. Try stripe.coupons.retrieve(promoCode)
   b. If not found, search coupons list by name
   c. If valid coupon found, create session with discounts: [{ coupon: id }]
   d. If not found, return error "Invalid promo code"
3. If no promoCode, create session with allow_promotion_codes: true (existing behavior)
```

No database changes needed.

