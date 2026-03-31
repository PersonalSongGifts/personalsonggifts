
Root cause is now clear: this is most likely not a banner-rendering bug anymore.

What I found:
- The app wiring is correct:
  - `ActivePromoProvider` wraps the whole app in `src/App.tsx`
  - homepage uses `Layout`, and `Layout` renders `PromoBanner` by default
  - `PromoBanner` hides only when `loading`, `promo.active` is false, or `showBanner` is false
- The current Easter promo in the database is:
  - `is_active = true`
  - `show_banner = true`
  - `slug = easter`
  - prices = 2499 / 3499 / 2499
  - `starts_at = 2026-03-31 23:22:00+00`
  - `ends_at = 2026-04-12 23:22:00+00`
- `get-active-promo` only returns a promo when:
  - `is_active = true`
  - `starts_at <= now`
  - `ends_at >= now`

Why you are seeing no banner and no promo pricing:
- The Easter promo is activated, but its scheduled start time is later than when you checked.
- So the backend correctly treats it as “not live yet”.
- That means:
  - homepage banner does not render
  - checkout pricing stays on non-Easter pricing
  - lead preview pricing also stays on non-Easter pricing

Plan:
1. Fix the current Easter promo timing
- Update the Easter promo so `starts_at` is in the past or “now”.
- Keep the desired end date/time.
- Re-check the homepage and checkout immediately after.

2. Make promo scheduling foolproof in admin
- Add a clearer status in the Promos tab:
  - Active now
  - Scheduled / starts later
  - Expired
  - Inactive
- Show the exact interpreted start/end time next to the form fields.
- Add timezone copy directly in the form so admins know what the datetime inputs mean.

3. Prevent this exact mistake in the future
- When activating a promo whose start time is still in the future, show a warning like:
  - “This promo is activated, but it will not appear until its start date/time.”
- When saving, show a summary:
  - “Will go live at …”
  - “Will end at …”

4. Verify all customer-facing surfaces after the date fix
- Homepage:
  - banner appears at the very top
  - Easter text appears
  - banner color matches admin settings
- Checkout:
  - standard shows original price struck through and promo price $24.99
  - priority shows original price struck through and promo price $34.99
- Lead preview page:
  - lead unlock price shows promo price if applicable

5. Verify payment behavior after the promo is actually live
- Stripe checkout request sends the promo slug only when the promo is live
- PayPal order creation uses promo pricing only when the promo is live
- If the promo expires mid-flow, frontend still shows the “This sale has ended” handling

Technical details:
- This is a scheduling/data issue, not a missing JSX/render issue.
- No major Stripe/PayPal rewrite is indicated by the current evidence.
- The same “active promo” gate controls banner visibility and checkout pricing, so one incorrect start time explains both symptoms.
- The highest-value fix is:
  1. correct the Easter promo start time
  2. improve admin timezone/status clarity so this cannot happen again
