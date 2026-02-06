

# Fix Broken Album Art Fallback + Salvage 3 Orders

## Root Cause

Two issues combine to break the album artwork display:

1. **3 delivered orders have no extracted cover art** (MP3 files had no embedded APIC ID3 tag)
2. **The fallback occasion images are unreachable in production** -- `SongPlayer.tsx` references them as `/src/assets/occasions/valentines.jpg`, but Vite hashes and bundles files from `src/assets/` during production builds. Those raw paths return 404 in production.

So: no cover art extracted AND the fallback doesn't work either = broken image.

## Affected Orders (3 total)

| Order ID | Occasion | Song Title |
|----------|----------|------------|
| 09885580 (Rick) | valentines | Oh Rick you're the rock that holds us down |
| a7d1fec4 (Jah) | custom | Oh Jah you're the anchor in the storm |
| dada239e | anniversary | (no title) |

The other 108 delivered orders have cover art extracted and display fine.

## The Fix (2 Parts)

### Part 1: Fix occasion image fallback paths in SongPlayer.tsx

**Current (broken in production):**
```
const occasionImages: Record<string, string> = {
  birthday: "/src/assets/occasions/birthday.jpg",
  valentines: "/src/assets/occasions/valentines.jpg",
  ...
};
```

**Fix:** Import each image as an ES module so Vite properly bundles and hashes them:
```
import birthdayImg from "@/assets/occasions/birthday.jpg";
import valentinesImg from "@/assets/occasions/valentines.jpg";
...

const occasionImages: Record<string, string> = {
  birthday: birthdayImg,
  valentines: valentinesImg,
  ...
};
```

This ensures the fallback images work in production for any order missing cover art, both now and in the future.

Also add mappings for `"custom"`, `"pet-celebration"`, `"pet-memorial"`, and `"family"` occasions that exist as images but aren't in the current lookup map.

### Part 2: Salvage cover art for the 3 affected orders (no regeneration needed)

Since these songs are already uploaded and playing, we don't need to regenerate anything. Instead, with the fallback fix from Part 1, these 3 orders will automatically show the correct occasion image:

- **09885580** -- Will show `valentines.jpg` (fallback works after fix)
- **dada239e** -- Will show `anniversary.jpg` (fallback works after fix)
- **a7d1fec4** -- Has occasion `"custom"` which has no matching image. Will fall back to `placeholder.svg`. To improve this, we can add a generic "custom" fallback or map it to `"just-because.jpg"`.

No database changes needed. No re-uploads needed. The fallback fix alone solves the display for all 3.

## File Changes

| File | Change |
|------|--------|
| `src/pages/SongPlayer.tsx` | Replace string path references with proper ES module imports for all 15 occasion images. Add missing occasion mappings (custom, pet-celebration, pet-memorial, family). |

## What Customers Will See After Fix

- Rick's song page will show the Valentine's Day occasion image instead of a broken icon
- All future orders without embedded cover art will gracefully fall back to their occasion image
- No song regeneration, re-upload, or manual intervention needed

