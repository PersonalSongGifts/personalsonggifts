

## Style the Edit Song Details section with a subtle gradient card

### Change
Wrap the revision link section (lines 359-371 in `PaymentSuccess.tsx`) in a styled Card with a soft gradient background, similar to the Expected Delivery and Watch for your song email cards but with a different subtle color -- a light lavender/blue-gray gradient that complements the existing cream/navy palette.

### Implementation
- Replace the plain `<div className="mb-6">` wrapper with a `<Card>` that has a subtle gradient using inline styles (e.g., a soft blue-gray: `background: linear-gradient(135deg, hsl(220 30% 97%), hsl(210 25% 94%))`  with a matching light border)
- Keep the text and button inside, centered
- This creates visual consistency with the other info cards on the page while using a distinct, subtle color

### File
- `src/pages/PaymentSuccess.tsx` -- lines 359-371 only

