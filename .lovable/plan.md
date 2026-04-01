
Fix the incorrect promo price display on the checkout tier cards.

What’s wrong
- The backend promo data is correct: `useActivePromo`, `get-active-promo`, `create-checkout`, and `create-paypal-order` all support separate Standard and Priority promo prices.
- The UI bug is in `src/pages/Checkout.tsx`.
- Each card currently renders:
  - selected tier: `pricing.total`
  - unselected tier: `calculateSeasonalPriceCents(...)`
- That means when Standard is selected, the Priority card falls back to the old seasonal price (`$79.99`) instead of the promo price (`$34.99`). The reverse would happen if Priority were selected.

Implementation plan
1. Update `src/pages/Checkout.tsx`
- Add a small helper or memoized map for display prices per tier, separate from the currently selected checkout total.
- Logic:
  - if active promo exists:
    - standard card shows `activeFlashPromo.standardPriceCents / 100`
    - priority card shows `activeFlashPromo.priorityPriceCents / 100`
  - otherwise:
    - standard card shows `calculateSeasonalPriceCents("standard") / 100`
    - priority card shows `calculateSeasonalPriceCents("priority") / 100`

2. Keep payment behavior unchanged
- Do not change Stripe/PayPal pricing logic.
- Do not change order summary total logic.
- `pricing.total` should still represent only the selected tier for checkout submission.

3. Replace both card price renderers
- Standard card should always display the Standard visible price.
- Priority card should always display the Priority visible price.
- This removes the incorrect dependency on `selectedTier` for the non-selected card’s displayed amount.

4. Verify after the fix
- With Easter promo active and Standard selected:
  - Standard card = `$24.99`
  - Priority card = `$34.99`
- With Easter promo active and Priority selected:
  - Standard card = `$24.99`
  - Priority card = `$34.99`
- Without active promo:
  - Standard card = `$49.99`
  - Priority card = `$79.99`
- Confirm order summary and payment button still update based on the selected tier.

Technical detail
- Root cause is presentation-only.
- The current bug is caused by this pattern in `Checkout.tsx`:
  - Standard card: `selectedTier === "standard" ? pricing.total : seasonal standard`
  - Priority card: `selectedTier === "priority" ? pricing.total : seasonal priority`
- The fix is to decouple “card display price for each tier” from “selected tier total”.
