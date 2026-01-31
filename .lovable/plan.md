
# Valentine's Day Promo & New Pricing Implementation

## Summary
Update the checkout system to use the new $159.99/$99.99 pricing with automatic 50% off promo codes that switch based on date. Also update the promo banner messaging.

---

## What Will Change

### 1. Promo Banner Update
The top banner will change from:
> 💘 Valentine's Day Special – Limited Time Offer

To:
> 💘 Valentine's Day Special – 50% Off! Hurry, Limited Time Offer!

### 2. Checkout Page Pricing Display
- **Standard Song**: Shows ~~$99.99~~ → **$49.99** (with 50% off applied)
- **Priority Song**: Shows ~~$159.99~~ → **$79.99** (with 50% off applied)
- Visual indicator showing the discount is automatically applied

### 3. Automatic Promo Code Scheduling
The system will automatically apply promo codes at checkout:

| Time Period | Promo Code |
|-------------|------------|
| Now until Feb 15, 2026 at 1:00 AM PST | **VALENTINES50** |
| Feb 15, 2026 at 1:01 AM PST onwards | **WELCOME50** |

---

## About Your Old Stripe Products

**You don't need to archive them.** The old $49 and $79 products will simply not be used since I'm updating the code to use the new Price IDs. They'll remain in your Stripe account if you ever want to switch back - just let me know and I can swap the Price IDs.

---

## Technical Details

### Files to Modify

**1. Edge Function: `supabase/functions/create-checkout/index.ts`**
- Update `PRICE_IDS` to new values:
  - Standard: `price_1SvRTtGax2m9otRw75yrsjxS` ($99.99)
  - Priority: `price_1SvRUXGax2m9otRwZOb1lNHD` ($159.99)
- Add date-based promo code logic using PST timezone
- Replace `allow_promotion_codes: true` with `discounts` array containing the active promo code

**2. Promo Banner: `src/components/layout/PromoBanner.tsx`**
- Update text to include "50% Off" and "Hurry"

**3. Checkout Page: `src/pages/Checkout.tsx`**
- Update displayed prices to show original ($99.99/$159.99) with strikethrough
- Show discounted price ($49.99/$79.99) prominently
- Add "50% OFF - Auto Applied" badge
- Update analytics tracking values
- Update button text to show final discounted price

### Promo Code Logic (PST Timezone)
```text
┌─────────────────────────────────────────────────────────┐
│                  Current Time (PST)                      │
│                         ↓                                │
│  Before Feb 15, 2026 1:00 AM?                           │
│         ↓                    ↓                          │
│        YES                   NO                         │
│         ↓                    ↓                          │
│  Apply VALENTINES50    Apply WELCOME50                  │
└─────────────────────────────────────────────────────────┘
```

---

## Future Promo Changes
When you want to change the active promo code, just let me know:
- The new promo code name
- When it should start/end (in PST)

I'll update the edge function logic accordingly.
