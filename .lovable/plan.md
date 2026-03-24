

## Add Amplitude Purchase Tracking

### What
Add Amplitude event tracking to the existing `trackPurchaseEvent` function in `PaymentSuccess.tsx`. This fires alongside the existing Meta, GA, and TikTok purchase events — same place, same data, no new infrastructure needed.

### Changes

**`src/pages/PaymentSuccess.tsx`** — Inside `trackPurchaseEvent` callback (~line 46-77)

Add two calls after the existing TikTok tracking:

1. **`amplitude.track('Purchase Completed', {...})`** with properties: `order_id`, `revenue`, `currency`, `pricing_tier`, `occasion`, `genre`, `recipient_name`, `is_lead_conversion`

2. **`amplitude.revenue()`** using the Revenue helper so Amplitude recognizes it in revenue reports: `productId` = pricing tier, `price` = purchase value, `quantity` = 1

Access Amplitude via `window.amplitude` (CDN global) with proper type guards (`if (window.amplitude)`) to avoid errors if the script hasn't loaded.

### Why this location
`trackPurchaseEvent` already has deduplication via `hasTrackedPurchase.current` ref, and fires for all three payment paths (Stripe, PayPal, lead conversion). One change covers everything.

### No other files changed

