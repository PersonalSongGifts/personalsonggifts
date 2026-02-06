

# Move Valentine's Delivery Notice & Update Copy

## What's Changing

Two simple changes to the checkout page:

1. **Move the notice up** -- from its current spot (above the Pay button) to directly below the pricing cards and above the Order Summary
2. **Update the helper text** -- change the small line at the bottom of the notice

## Current Layout Order
```text
Pricing Cards (Standard / Priority)
Order Summary
Reassurance icons
Valentine's Notice  <-- currently here
Pay Button
```

## New Layout Order
```text
Pricing Cards (Standard / Priority)
Valentine's Notice  <-- moved here
Order Summary
Reassurance icons
Pay Button
```

## Copy Change

The helper text at the bottom of the notice changes from:
- Old: "We review each order before sending."
- New: "Our team works around the clock to make every song just right."

---

## Technical Details

### File: `src/pages/Checkout.tsx`

- Remove the `<ValentineDeliveryNotice />` and its comment from its current position (between the reassurance grid and the Pay button, around line 434-435)
- Insert `<ValentineDeliveryNotice />` directly after the closing `</div>` of the pricing cards grid (`mb-10`) and before the Order Summary card -- adding appropriate bottom margin (`mb-6`)
- Remove the `mt-4` class that was added to the Pay button (no longer needed since the notice won't be adjacent)

### File: `src/components/checkout/ValentineDeliveryNotice.tsx`

- Update the helper text line from `"We review each order before sending."` to `"Our team works around the clock to make every song just right."`

No other files affected. No design, behavior, or logic changes -- just repositioning and a single copy update.

