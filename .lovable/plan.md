

# Fix Step Numbers Position & Comprehensive Scroll-to-Top

## Issues Identified

### Issue 1: Step Numbers on Right Side (Mobile)
The step number badges (1, 2, 3) in the "How It Works" section are positioned on the right on mobile due to conflicting responsive classes.

**Root Cause (Line 44 of HowItWorks.tsx):**
```tsx
className="absolute -top-2 -right-2 md:right-auto md:-left-2 ..."
```
- On mobile: `-right-2` places badge on the right
- On desktop: `md:right-auto md:-left-2` overrides to left

### Issue 2: Inconsistent Scroll-to-Top on CTAs
The current `ScrollToTop` component only triggers on route changes (pathname). It doesn't cover:
- Anchor links (e.g., `#samples`, `#how-it-works`)
- Query parameter changes (e.g., `/create?occasion=wedding`)

---

## Solution

### Fix 1: Step Numbers Position
Update the badge positioning to always be on the left of the icon circle on all screen sizes.

**File: `src/components/home/HowItWorks.tsx` (Line 44)**

Change from:
```tsx
<span className="absolute -top-2 -right-2 md:right-auto md:-left-2 w-8 h-8 ...">
```

To:
```tsx
<span className="absolute -top-2 -left-2 w-8 h-8 ...">
```

This simple change ensures the badge is always positioned to the upper-left of the parent container on all devices.

### Fix 2: Enhanced ScrollToTop Component
Update the `ScrollToTop` component to also respond to search query changes (for occasion selections in OccasionsGrid) and ensure all route changes scroll to top.

**File: `src/components/ScrollToTop.tsx`**

```tsx
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export const ScrollToTop = () => {
  const { pathname, search } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname, search]);

  return null;
};
```

This ensures that clicking occasion cards (which navigate to `/create?occasion=X`) also triggers scroll-to-top.

---

## Technical Details

### All CTA Buttons Already Covered
The `ScrollToTop` component in `App.tsx` already handles all route-based navigation. Here's what's covered:

| Component | CTA Type | Scroll Coverage |
|-----------|----------|-----------------|
| Header | `Link to="/create"` | ✅ Covered by pathname change |
| PromoBanner | `Link to="/create"` | ✅ Covered by pathname change |
| HeroSection | `Link to="/create"` | ✅ Covered by pathname change |
| HeroSection | `a href="#samples"` | ⚠️ Same-page anchor (smooth scroll) |
| OccasionsGrid cards | `Link to="/create?occasion=X"` | ⚠️ Needs search param support |
| OccasionsGrid CTA | `Link to="/create"` | ✅ Covered by pathname change |
| Testimonials | `Link to="/create"` | ✅ Covered by pathname change |
| SamplePlayer | `Link to="/create"` | ✅ Covered by pathname change |
| HowItWorks | `Link to="/create"` | ✅ Covered by pathname change |
| FAQSection | `Link to="/create"` | ✅ Covered by pathname change |
| FinalCTA | `Link to="/create"` | ✅ Covered by pathname change |

### Form Step Transitions Already Fixed
The `CreateSong.tsx` already has `behavior: "instant"` for:
- `nextStep()` - Line 115
- `prevStep()` - Line 127

---

## Files Changed

| File | Change |
|------|--------|
| `src/components/home/HowItWorks.tsx` | Fix badge position: `-left-2` instead of `-right-2` (1 line) |
| `src/components/ScrollToTop.tsx` | Add `search` to dependency array for query param changes (2 lines) |

---

## Expected Result
- Step numbers (1, 2, 3) will appear on the left of each icon on both mobile and desktop
- All CTA buttons that navigate to new routes will scroll to top
- Occasion card selections (`/create?occasion=X`) will scroll to top
- Form step transitions will continue to scroll to top instantly

