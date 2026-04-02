

## Add Email Confirmation Callout on Checkout Page (Pre-Purchase)

### Problem
Customers mistype their email, never receive their song, and win Stripe chargebacks. Currently their email is shown on line 557 as small "Delivery to:" text that's easy to miss.

### Solution
Add a prominent email confirmation callout **between the Order Summary card and the payment buttons** (around line 642). This is the last thing they see before clicking "Pay" — if their email is wrong, they'll catch it here.

### Change: `src/pages/Checkout.tsx`

Insert a new callout card after the Order Summary `</Card>` (line 642) and before the "Reassurance" grid (line 644):

- Mail icon + bold heading: **"Your song will be delivered to:"**
- Customer email displayed in large, bold, prominent text
- Subtle note below: "Please double-check this is correct — your song will be sent here."
- Style: light info-toned background (`bg-blue-50 border-blue-200`), not alarming but impossible to miss
- Also keep the existing "Delivery to:" line in the order summary (line 557) since it's part of the receipt-style layout

### Why pre-purchase is better
- Customer can go back and fix their email before paying
- If they proceed, it's clear evidence they confirmed the email (helps win disputes)
- Zero conversion friction — it's just a confirmation, not an extra step

### Files
| File | Change |
|------|--------|
| `src/pages/Checkout.tsx` | Add email confirmation callout between order summary and payment buttons |

