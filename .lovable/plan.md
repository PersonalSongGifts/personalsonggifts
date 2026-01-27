
# Fix Scroll-to-Top Issues

## Problem Analysis

I identified two distinct scroll issues:

### Issue 1: Page Navigation Doesn't Scroll to Top
When clicking "Create Your Song" from the homepage (or navigating between any routes), the browser maintains the previous scroll position. This happens because:
- **No global scroll restoration** - The `App.tsx` routing configuration lacks a `ScrollToTop` component
- React Router doesn't automatically scroll to top on navigation

### Issue 2: Step Transitions Sometimes Don't Scroll to Top
During the multi-step form in `/create`, the scroll sometimes fails because:
- **CSS conflict** - Global `scroll-behavior: smooth` in `src/index.css` can race with JavaScript scroll commands
- **Timing issues** - The smooth scroll animation can be interrupted by React re-renders

---

## Solution

### Step 1: Create a ScrollToTop Component
Create a new component that listens for route changes and scrolls to top instantly.

**File: `src/components/ScrollToTop.tsx`**
```typescript
import { useEffect } from "react";
import { useLocation } from "react-router-dom";

export const ScrollToTop = () => {
  const { pathname } = useLocation();

  useEffect(() => {
    window.scrollTo({ top: 0, left: 0, behavior: "instant" });
  }, [pathname]);

  return null;
};
```

### Step 2: Add ScrollToTop to App.tsx
Place the component inside `BrowserRouter` so it can access routing context.

```typescript
// Add import
import { ScrollToTop } from "./components/ScrollToTop";

// Add inside BrowserRouter, before Routes
<BrowserRouter>
  <ScrollToTop />
  <Routes>
    ...
  </Routes>
</BrowserRouter>
```

### Step 3: Fix Step Transitions in CreateSong.tsx
Change `behavior: "smooth"` to `behavior: "instant"` for reliable scrolling during form step changes.

```typescript
// In nextStep function (line 115)
window.scrollTo({ top: 0, behavior: "instant" });

// In prevStep function (line 127)
window.scrollTo({ top: 0, behavior: "instant" });
```

---

## Why This Works

| Fix | Problem Solved |
|-----|----------------|
| `ScrollToTop` component | Ensures every route change scrolls to top |
| `behavior: "instant"` | Eliminates race conditions with CSS smooth scrolling |
| Global placement in App.tsx | Covers all navigation throughout the app |

---

## Files Changed

1. **Create** `src/components/ScrollToTop.tsx` - New component (6 lines)
2. **Edit** `src/App.tsx` - Add import and component (2 lines changed)
3. **Edit** `src/pages/CreateSong.tsx` - Change scroll behavior (2 lines changed)

This is a minimal, proven solution that follows React Router best practices and matches the pattern recommended in the useful context.
