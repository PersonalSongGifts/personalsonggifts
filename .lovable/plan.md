

## Fix: Songs Not Loading ("Song Not Found") for Many Customers

### Root Cause

The song delivery page (`/song/:shortId`) uses 8-character short IDs to look up orders. The edge function currently fetches **all 1,052+ delivered orders** into memory, then filters by ID prefix in JavaScript. But Supabase has a **default 1,000-row query limit** -- so any order beyond row 1,000 silently vanishes, causing "Song not found."

As your order volume grew past 1,000 delivered orders, this started affecting more and more customers. It will only get worse as orders increase.

### The Fix

Replace the "fetch all, filter in JS" pattern with a **server-side prefix filter** using Postgres `ilike`. Instead of loading 1,000+ rows, it loads only the 1 matching row. This is both faster and has no row-limit issues.

```text
Before:  SELECT * FROM orders WHERE status IN ('delivered','ready')  --> 1,052 rows --> JS filter
After:   SELECT * FROM orders WHERE id::text ILIKE 'b15daeb8%'      --> 1 row
```

### Files Changed

**1. `supabase/functions/get-song-page/index.ts`**
- Replace the short ID branch: instead of fetching all orders and filtering, use `.ilike('id', orderId + '%')` with `.in("status", ["delivered", "ready"])` and `.not("song_url", "is", null)`
- Add `.limit(2)` to remain collision-safe (if 2+ results, return "Ambiguous ID")

**2. `supabase/functions/track-song-engagement/index.ts`**
- Same fix: replace fetch-all + `.find()` with `.ilike('id', orderId + '%').limit(2)`

**3. `supabase/functions/create-lyrics-checkout/index.ts`**
- Same fix: replace fetch-all + `.filter()` with `.ilike('id', orderId + '%').limit(2)`

### What This Fixes

- All existing delivered songs will immediately become accessible again
- No data migration or manual restoration needed -- the songs and audio files are intact in storage, the lookup query was just failing to find them
- Performance improves dramatically (1 row fetched vs 1,000+)
- The fix scales to any number of orders

### Technical Details

Each of the three edge functions has a `if (isShortId)` branch that will be updated from:

```typescript
// OLD: Fetches up to 1,000 rows, misses orders beyond that
const result = await supabase
  .from("orders")
  .select(selectFields)
  .in("status", ["delivered", "ready"])
  .not("song_url", "is", null);
orders = result.data?.filter(o => o.id.startsWith(orderId)) || [];
```

To:

```typescript
// NEW: Server-side prefix match, returns only matching rows
const result = await supabase
  .from("orders")
  .select(selectFields)
  .ilike("id", `${orderId}%`)
  .in("status", ["delivered", "ready"])
  .not("song_url", "is", null)
  .limit(2);
orders = result.data || [];
```

The `.limit(2)` preserves the existing collision safety check (if more than 1 match, return "Ambiguous ID" error).
