
# Plan: Homepage Redesign - Remove Videos, Add Text Review Grid, Move "As Seen On"

## Summary of Changes

### 1. Remove "Hear Sample Songs" Button from Hero
The secondary outline button that links to `#samples` will be removed from `HeroSection.tsx`. Only the "Create Your Song" CTA will remain.

### 2. Move "As Seen On" Graphic to Hero Section
Move the "As Seen On TV" image from `TrustStrip.tsx` into `HeroSection.tsx`, positioned directly below the "Create Your Song" button. This places it above the fold for maximum trust-building impact.

### 3. Convert Testimonials to Text-Only Grid
Completely rewrite `Testimonials.tsx` to:
- Remove all video testimonials and video-related code
- Create a clean 4-column x 2-row grid of text reviews (8 total)
- Keep the existing 4 text reviews and add 4 new ones to match your screenshot

The new reviews to add:
- Stephen: "He raised five kids that weren't his... and loved them like they were. That's the kind of man he is."
- Rachel M.: "I gave this to my mom for her 70th birthday and she played it on repeat for a week straight."
- James & Olivia: "Our wedding guests were in tears. It was the highlight of the entire reception."
- Marcus T.: "I ordered this for my wife's birthday and she said it was the most thoughtful gift she's ever received."
- The Rivera Family: "We played it at Dad's memorial and there wasn't a dry eye in the room. It captured him perfectly."

### 4. Simplify TrustStrip Component
Remove the "As Seen On" image from `TrustStrip.tsx` since it's moving to the hero. Keep only the stats (4.9 Rating, 1,000+ Families Served) if that section remains, or consider removing the TrustStrip entirely if it becomes redundant.

---

## Technical Changes

### File 1: `src/components/home/HeroSection.tsx`
- Remove the "Hear Sample Songs" button (lines 102-112)
- Import the `asSeenOnImage` asset
- Add the "As Seen On" image below the CTA button
- Keep the video with "Listen to Example" button overlay at top

### File 2: `src/components/home/Testimonials.tsx`
Complete rewrite to text-only grid:
- Remove all video-related interfaces, components, and logic
- Keep only `TextTestimonial` interface
- Expand testimonials array to 8 text reviews
- Create a simple 4-column responsive grid layout
- Each card: 5 gold stars, quote text, author name, verified badge

### File 3: `src/components/home/TrustStrip.tsx`
- Remove the "As Seen On" image (now in hero)
- Keep just the rating and families served stats
- Simplify the layout

---

## Visual Result
The homepage will flow as:
1. **Hero Section**:
   - Video with "Listen to Example" button
   - Headline + subheadline
   - Single "Create Your Song" CTA button
   - "As Seen On" logos immediately below (above the fold)
   - Trust indicator text

2. **Testimonials Section**:
   - "Real stories from real customers" heading
   - Clean 4x2 grid of text review cards
   - Each card with stars, quote, author, verified badge

3. **Trust Strip** (simplified):
   - Just the 4.9 Rating and 1,000+ Families stats
