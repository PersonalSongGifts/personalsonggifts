

# Add Expected Delivery to Zapier Webhook

## Overview
Add the `expectedDelivery` field to the Zapier webhook payload so you can see the delivery deadline in your Google Sheet.

## Change Required

**File**: `supabase/functions/process-payment/index.ts`

Add one line to the Zapier webhook payload (around line 176):

```typescript
body: JSON.stringify({
  orderId: newOrder.id,
  createdAt: new Date().toISOString(),
  status: "paid",
  pricingTier: newOrder.pricing_tier,
  price: price,
  expectedDelivery: newOrder.expected_delivery,  // ← Add this line
  customerName: metadata.customerName || "",
  // ... rest of fields
}),
```

## Result

After this change, Zapier will receive:
- **Standard orders**: Delivery timestamp 48 hours from order time
- **Priority orders**: Delivery timestamp 24 hours from order time

You'll then map this new `expectedDelivery` field to a column in your Google Sheet.

