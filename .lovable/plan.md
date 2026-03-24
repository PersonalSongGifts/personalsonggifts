

## Fix cs-agent-lookup UUID Matching + Add Revision Data

### Root Cause
The Supabase JS `.ilike("id::text", ...)` doesn't work — the client interprets `id::text` as a literal column name. Need to use `.filter("id::text", "ilike", value)` instead, which passes the cast-expression through to PostgREST.

### Changes

**`supabase/functions/cs-agent-lookup/index.ts`**

1. **Fix UUID text matching** in all three places (lines 79, 96, 143):
   - Replace `.ilike("id::text", ...)` with `.filter("id::text", "ilike", `${shortId}%`)`

2. **Add revision_requests to `lookup_order` response** — after fetching orders, query `revision_requests` for each order and attach as `revision_requests` array

3. **Add revision_requests to `lookup_by_email` response** — same pattern: for each order returned, fetch its revision requests

### No other files changed. Redeploy and test after.

