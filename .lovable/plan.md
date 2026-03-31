

## Fix: Promo Banner Not Updating on Frontend

### Root Cause
The edge function works correctly (confirmed by direct test — returns `active: true` with Easter promo data). The problem is the **frontend fetch**:

1. **`method: "GET"` in `supabase.functions.invoke()`** — In newer Supabase JS SDK versions, this actually sends a GET request. Combined with `Cache-Control: public, max-age=60` on the response, browsers aggressively cache the old `{ active: false }` response. Incognito/different browsers may have gotten this cached response on first load.

2. **Banner always shows fallback** — When `promo.active` is false, the banner still renders with hardcoded "50% Off Sale Ends Today!" text instead of hiding.

### Fix (2 files)

**1. `src/hooks/useActivePromo.tsx`**
- Remove `method: "GET"` from `supabase.functions.invoke()` — let it default to POST, which avoids browser-level HTTP caching entirely.

**2. `supabase/functions/get-active-promo/index.ts`**
- Change `Cache-Control` from `public, max-age=60` to `no-cache, no-store` to prevent any caching of the response (since we switched to POST, browser caching is less of an issue, but this is belt-and-suspenders).

**3. `src/components/layout/PromoBanner.tsx`**
- When `promo.active` is false OR `promo.showBanner` is false, hide the banner entirely (return null) instead of showing the hardcoded fallback text.

### Redeploy
The `get-active-promo` edge function must be redeployed after the cache header change.

