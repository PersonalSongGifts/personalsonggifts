

## Fix: Admin Dashboard Only Loading 200 of 754 Orders

### Root Cause

The recent optimization introduced a mismatch between the initial page fetch and the background loading logic:

1. **Page 0** fetches `pageSize=200` (rows 0--199)
2. Background loading calculates `maxPages = Math.ceil(754 / 1000) = 1`
3. Since `maxPages` is NOT greater than 1, **no background pages are fetched at all**
4. Result: Only 200 orders and ~200 leads are loaded -- all stats, charts, and revenue totals are based on incomplete data

Even if there were enough records for `maxPages > 1`, page 1 with `bgPageSize=1000` would start at offset 1000, **skipping rows 200--999**.

### Fix

Change the background loading logic in both `handleLogin` and `fetchOrders` to:

1. Calculate remaining records after the initial 200-row fetch
2. Fetch remaining records using `bgPageSize=1000`, starting from offset 200 (not offset 1000)

### Technical Details

**File: `src/pages/Admin.tsx`** (two locations: ~line 401 and ~line 482)

Replace the background loading block in both `handleLogin` and `fetchOrders`:

```typescript
// Current (broken):
const bgPageSize = 1000;
const maxPages = Math.max(
  Math.ceil(totalOrders / bgPageSize),
  Math.ceil(totalLeads / bgPageSize)
);
if (maxPages > 1) {
  const pagePromises = Array.from({ length: maxPages - 1 }, (_, i) =>
    listOrders("all", i + 1, bgPageSize)
  );
  // ...
}

// Fixed:
const initialPageSize = 200;
const bgPageSize = 1000;
const remainingOrders = Math.max(0, totalOrders - initialPageSize);
const remainingLeads = Math.max(0, totalLeads - initialPageSize);
const bgPages = Math.max(
  Math.ceil(remainingOrders / bgPageSize),
  Math.ceil(remainingLeads / bgPageSize)
);
if (bgPages > 0) {
  // Each background page fetches from offset = initialPageSize + (i * bgPageSize)
  const pagePromises = Array.from({ length: bgPages }, (_, i) => {
    const offset = initialPageSize + i * bgPageSize;
    // We pass page/pageSize such that range = offset to offset+bgPageSize-1
    // Since the API uses: rangeStart = page * pageSize, we set page = offset/bgPageSize is wrong
    // Instead, we need to pass raw offset. Simplest fix: pass page as the raw start offset divided by pageSize
    // But the API computes rangeStart = page * pageSize, so we need page = offset / bgPageSize... 
    // This won't work cleanly. Better approach: just use the list function with correct math.
  });
}
```

Since the API calculates `rangeStart = page * pageSize`, the cleanest approach is to **make the initial fetch also use pageSize=1000** but only render the first response immediately. This way page math stays consistent:

```typescript
// Simplest correct fix: use bgPageSize for ALL fetches including page 0
const { data, error } = await listOrders("all", 0, 1000);
// ... set state immediately for fast render ...

const bgPageSize = 1000;
const maxPages = Math.max(
  Math.ceil((data.totalOrders || 0) / bgPageSize),
  Math.ceil((data.totalLeads || 0) / bgPageSize)
);
if (maxPages > 1) {
  const pagePromises = Array.from({ length: maxPages - 1 }, (_, i) =>
    listOrders("all", i + 1, bgPageSize)
  );
  // ... same parallel fetch logic ...
}
```

This is the simplest, most reliable fix. Page 0 with 1000 rows is still fast (~1-2 seconds), and the page math is now correct: with 754 orders, `maxPages = 1`, so no background loading needed (all orders fit in page 0). With 1200 leads, `maxPages = 2`, so one background page fetches leads 1000-1199.

### Files Modified

| File | Changes |
|------|---------|
| `src/pages/Admin.tsx` | Change initial `listOrders` call from `pageSize=200` to `pageSize=1000` in both `handleLogin` (~line 374) and `fetchOrders` (~line 470) |

### Expected Impact

- All 754 orders loaded instead of just 200
- All 1200 leads loaded (page 0 gets 1000, page 1 gets remaining 200)
- Revenue, charts, and all analytics reflect complete data
- No change in perceived load speed (1000-row fetch is still fast)

