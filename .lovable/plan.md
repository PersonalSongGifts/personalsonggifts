

## Post-Valentine's Day Cleanup

Remove Valentine's-specific promotions and UI while keeping the site functional. Here's what changes and what stays safe.

### Changes Required

**1. PromoBanner (`src/components/layout/PromoBanner.tsx`)**
- Change text from "💘 Valentine's Day Special – 50% Off! Hurry, Limited Time Offer!" to "🎵 50% Off Sale Ends Today! Create Your Song →"
- Remove the heart emoji, keep the link

**2. OccasionStep (`src/components/create/OccasionStep.tsx`)**
- Remove the featured Valentine's Day button at the top and the "or choose another occasion" divider
- Add "Valentine's Day" back into the regular grid as a normal option (not featured)
- Ensure the grid displays cleanly on mobile (2 cols), tablet (3 cols), and desktop (4 cols) with 17 total items

**3. ValentineDeliveryNotice (`src/components/checkout/ValentineDeliveryNotice.tsx`)**
- Already auto-hides after Feb 15 (the `VALENTINES_DAY_END` check returns `null`). No change needed -- it's already hidden.

**4. Checkout promo code (`src/pages/Checkout.tsx`, line 38-48)**
- The `getActivePromo()` function already switches from `VALENTINES50` to `WELCOME50` after Feb 15 at 1 AM PST. Already switched. No change needed.

### Things That Stay (Safe to Keep)

- **SamplePlayer** -- "33 Valentines" is just a sample song title, not promotional
- **OccasionsGrid on homepage** -- Valentine's Day is a valid occasion year-round
- **SongPlayer occasion images** -- Maps "valentines" occasion to a background image; functional, not promotional
- **SongPreview `vday10` parameter** -- Only activates via a specific URL parameter (`?vday10=true`); won't show unless linked to. Can clean up later if desired
- **Edge functions** (`create-lead-checkout`, `create-checkout`) -- The `vday10` discount and `VALENTINES50` code logic in the backend is fine to leave; they only activate when explicitly called with those parameters
- **Admin ValentineRemarketingPanel** -- Admin-only, not customer-facing

### Technical Details

**File 1: `src/components/layout/PromoBanner.tsx` (line 14)**
- Replace the banner text span content with: `🎵 50% Off Sale Ends Today!`

**File 2: `src/components/create/OccasionStep.tsx`**
- Remove `featuredOccasion` config block (lines 18-22)
- Add `{ id: "valentines", label: "Valentine's Day" }` into the `occasions` array
- Remove the featured button JSX, the divider JSX, and the `isFeaturedSelected` variable
- Render only the grid of all occasions (now 17 items)

No backend, database, or edge function changes needed.

