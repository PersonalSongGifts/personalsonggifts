

## Fix Admin Panel Loading Speed

### Root Cause

Two compounding issues are making everything extremely slow:

**1. Page size mismatch creates 44+ parallel requests instead of 9**

The initial login/refresh call uses `pageSize: 200` for a fast first render. But the background loading reuses that same pageSize (200) for all remaining pages. With 8,800+ leads, that means `Math.ceil(8800/200) - 1 = 43` parallel edge function calls instead of ~9. Each call cold-boots the function, so you're hammering 43 concurrent requests at once.

**2. Orders still fetch ALL columns (`SELECT *`)**

The leads query was optimized to fetch only needed columns, but the orders query still does `select("*")`, pulling heavy text blobs like `automation_lyrics`, `automation_raw_callback`, `lyrics_raw_attempt_1/2`, etc. for every order.

### Solution

**Fix 1: Use pageSize=1000 for background loading (regardless of initial page size)**

In both `handleLogin` and `fetchOrders` in `Admin.tsx`, hardcode the background page size to 1000 instead of reusing the initial response's pageSize. This drops 43 parallel requests down to 9.

```
// Before (broken):
const pageSize = data.pageSize || 1000;  // returns 200 from initial call

// After (fixed):
const bgPageSize = 1000; // Always use large pages for background loading
const maxPages = Math.max(
  Math.ceil((data.totalOrders || 0) / bgPageSize),
  Math.ceil((data.totalLeads || 0) / bgPageSize)
);
// Use bgPageSize for all subsequent calls
```

**Fix 2: Apply lean column selection to orders too**

Replace `select("*")` on the orders query with specific columns, excluding the same heavy fields:
- `automation_raw_callback`
- `automation_lyrics`
- `lyrics_raw_attempt_1`
- `lyrics_raw_attempt_2`
- `automation_audio_url_source`
- `lyrics_language_qa`
- `prev_automation_lyrics`
- `prev_cover_image_url`

### Expected Impact

- **43 parallel requests down to 9** -- massive reduction in edge function cold boots and concurrent load
- **~50% smaller order payloads** -- faster network transfer and JSON parsing
- Combined: admin panel should load in 5-10 seconds instead of 60+

### Files Modified

| File | Changes |
|------|---------|
| `src/pages/Admin.tsx` | Use bgPageSize=1000 for background page loading in both `handleLogin` and `fetchOrders` |
| `supabase/functions/admin-orders/index.ts` | Replace `select("*")` with specific column list for orders pagination query |

