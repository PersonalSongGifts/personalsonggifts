

## Add 99% Off Admin Test Code

**Code:** `ADMINTEST99` — gives 99% off any tier, resulting in ~$0.50 charge (enough to test payment processing).

### Changes

**1. `supabase/functions/validate-promo-code/index.ts`**
- Add `"ADMINTEST99": 99` to `TEST_CODES`

**2. `supabase/functions/create-checkout/index.ts`**
- Add `"ADMINTEST99"` handling: instead of treating it as a free code (which skips Stripe), calculate 99% off so it goes through normal Stripe checkout with a real charge
- Standard tier: $49.99 × 1% = ~$0.50
- Priority tier: $79.99 × 1% = ~$0.80

The code will NOT be added to `FREE_TEST_CODES` (which would make it $0 and skip payment). Instead, it will be handled as a special discount in the price calculation, ensuring Stripe actually processes a real charge.

