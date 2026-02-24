

# Display Price Paid on Thank You Page

## What Changes
Add a "Price paid" row to the Order Details card on the payment success page, showing the actual amount the customer was charged (e.g., `$49.99`).

## How Promo Codes Are Handled
The price displayed will always be correct regardless of promo codes. Here's why:
- The backend stores `price_cents` directly from Stripe's `session.amount_total`, which is the final charge after all discounts
- The `price` field returned to the frontend is `price_cents / 100`
- So if someone pays $49.99, or uses a 10% coupon and pays $44.99, or uses a 100% code and pays $0.00 -- it all shows correctly

## Change Details

**File: `src/pages/PaymentSuccess.tsx`**

Add a new row after the "Package" row in the Order Details card:

```
Price paid:    $49.99
```

- Uses `orderDetails.price` (already in the interface and returned by the backend)
- Falls back to tier-based default ($79.99 / $49.99) only if the field is somehow missing
- Formats with `toFixed(2)` for consistent decimal display
- Shows `$0.00` for free test code orders

