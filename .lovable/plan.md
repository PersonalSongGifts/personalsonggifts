

## Fix: Promo Banner Not Showing Active Promo

### Problem
You activated the promo in admin, but the banner still shows the fallback "50% Off Sale Ends Today!" text. This means `get-active-promo` is returning `{ active: false }`.

### Root Cause (most likely)
The `get-active-promo` edge function may not have been deployed after the promotions system was built. The function exists in the codebase but needs deployment.

Additionally, there may be a **timezone mismatch**: the admin form sends local datetime values, but `get-active-promo` compares against `new Date().toISOString()` (UTC). If `starts_at` was saved as a local time string without timezone info, the comparison could fail.

### Fix

1. **Deploy `get-active-promo`** edge function — this is likely the primary issue.

2. **Verify the promo record** — run a quick DB query to confirm the promo exists with `is_active = true`, `show_banner = true`, a non-empty `banner_text`, and that `starts_at <= now() <= ends_at`.

3. **Fix timezone handling in admin form** (if needed) — ensure `starts_at` and `ends_at` are stored as proper UTC timestamps so the edge function's date comparison works correctly.

### Files
- Deploy: `supabase/functions/get-active-promo/index.ts`
- Possibly fix: `src/components/admin/PromosPanel.tsx` (datetime conversion)
- Possibly fix: `supabase/functions/admin-promos/index.ts` (datetime storage)

### Steps
1. Deploy `get-active-promo`
2. Query the `promotions` table to inspect the saved record
3. If dates are wrong, fix the timezone conversion in the save logic
4. Verify banner updates on the homepage

