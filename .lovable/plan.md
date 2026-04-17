
## Plan: CRO Part 1 — Tracking + Sticky CTA + Hero Badge + SamplePlayer reposition

### 1. Amplitude tracking (try/catch wrapped)
- **HeroSection.tsx**: fire `Hero CTA Clicked` on primary "Create Your Song" button (also wrap audio Listen-to-Example button — out of scope, leave alone).
- **SamplePlayer.tsx**: fire `Sample Played` on first play per song (track via ref set), `Sample Completed` on `ended` event OR when `currentTime >= 0.9 * duration` (use a flag to fire once per play).
- **OccasionsGrid.tsx**: fire `Occasion Card Clicked` with `{ occasion: occasion.label }` on Link click.
- Helper: small inline `trackEvent(name, props)` util in each file (or one shared `src/lib/amplitudeTrack.ts` — preferred, single try/catch).

### 2. StickyMobileCTA component
- New file `src/components/home/StickyMobileCTA.tsx`.
- `useLocation()` → render only when `pathname === "/"`.
- Tailwind: `md:hidden fixed bottom-0 left-0 right-0`, white/cream bg with top border + shadow, `style={{ paddingBottom: 'env(safe-area-inset-bottom)' }}`.
- Z-index: existing modals (Dialog/Sheet) use Radix defaults (z-50). Use `z-40` so it stays under modals but above content.
- Copy: **"Create your song →"** (no price — avoids drift with Checkout pricing).
- onClick → fires `Sticky CTA Clicked` (try/catch) then navigates via `<Link to="/create">`.
- Mount once in `Index.tsx` so it's auto-scoped to `/`. Add `pb-20 md:pb-0` to the Index root wrapper to prevent the bar from covering FinalCTA.

### 3. Hero badge
- In HeroSection, add a small pill above (or just under) the primary CTA: `▶ Hear a sample` linking via smooth-scroll to `#samples` (the SamplePlayer section id already exists).
- Subtle pulse animation wrapped in `@media (prefers-reduced-motion: no-preference)` — add a one-off keyframe in `src/index.css` or use existing `animate-pulse-soft` already in use, gated behind a wrapper class that only animates when motion is allowed (Tailwind's `motion-safe:` variant — already supported).

### 4. Move SamplePlayer above the fold
- In `src/pages/Index.tsx`, reorder so `<SamplePlayer />` sits directly under `<HeroSection />` and above `<TrustStrip />` / `<OccasionsGrid />`.
- SamplePlayer already lazy-creates `new Audio(src)` only on play — no autoplay change needed. UI renders immediately, no layout shift.

### Files

| File | Change |
|---|---|
| `src/lib/amplitudeTrack.ts` (new) | Shared `trackEvent(name, props?)` with try/catch on `window.amplitude?.track` |
| `src/components/home/HeroSection.tsx` | Fire `Hero CTA Clicked`; add "▶ Hear a sample" badge linking to `#samples` |
| `src/components/home/SamplePlayer.tsx` | Fire `Sample Played` (first play) + `Sample Completed` (ended or ≥90%) |
| `src/components/home/OccasionsGrid.tsx` | Fire `Occasion Card Clicked` with occasion label |
| `src/components/home/StickyMobileCTA.tsx` (new) | Mobile-only, `/`-only sticky bottom CTA |
| `src/pages/Index.tsx` | Reorder SamplePlayer above OccasionsGrid; mount StickyMobileCTA; add `pb-20 md:pb-0` wrapper |

### Out of scope (explicit)
No changes to Checkout, CreateSong, any /create/* step, SongRevision, or any edge function. No exit-intent. No price in sticky bar or badge. No scroll/FAQ/testimonial events.

### Verification checklist after implementation
1. Sticky bar absent on `/create`, `/checkout`, `/song/...`, `/revision/...`, `/admin`.
2. Grep new code for `$` price strings → none.
3. All `amplitude.track` calls inside try/catch (via shared helper).
