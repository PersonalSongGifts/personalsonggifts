

## Fix: admin-promos Edge Function Not Reachable from Frontend

### Root Cause
`supabase.functions.invoke()` always sends POST requests. The `method: "GET"` parameter is ignored by the Supabase JS SDK. The backend checks `req.method === "GET"` for listing promos, which never matches.

### Fix
**`src/components/admin/PromosPanel.tsx`** — Change `fetchPromos` to send a POST with `body: { action: "list" }` instead of `method: "GET"`. Do the same for any other calls using `method: "GET"`.

**`supabase/functions/admin-promos/index.ts`** — Add `action === "list"` handler inside the POST block that returns the same promo list currently in the GET block. Keep the GET block as a fallback for direct HTTP calls.

### Files Changed
1. `src/components/admin/PromosPanel.tsx` — Fix invoke calls
2. `supabase/functions/admin-promos/index.ts` — Add "list" action to POST handler

