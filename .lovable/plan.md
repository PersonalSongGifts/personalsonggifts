

## Fix: Dashboard Only Showing 200 Orders

### Problem

The admin dashboard loads orders in pages of 200. Page 0 loads fine, but the background sync for pages 1-5 (to get all 1,063 orders) is **silently failing**. The `catch { break }` on line 376 of `Admin.tsx` swallows the error, so you only ever see the first 200 orders.

Edge function logs confirm: only "page 0" requests are reaching the server in recent sessions -- pages 1+ are never received.

### Colleen's Issue (Already Fixed)

Colleen's order `be7cedeb` is in the database with status `delivered` and a valid `song_url`. Her "Song Not Found" error was caused by the 1,000-row query limit bug we just fixed and deployed. Her song link should work now.

### Root Cause of the 200-Order Cap

The `catch { break }` pattern silently swallows any error from subsequent page fetches and stops the entire background sync. If page 1 fails for any reason (timeout, network blip, edge function cold start), ALL remaining pages are skipped and the dashboard stays at 200 orders.

### The Fix

**File: `src/pages/Admin.tsx`** -- Two changes in the background pagination loops:

1. **Add error logging** instead of silent `catch { break }` so issues are visible in the console

2. **Add retry logic** -- if a page fetch fails, retry once before giving up on that page, and continue to the next page instead of breaking the entire loop

3. **Add a small delay between page fetches** to avoid overwhelming the edge function with rapid sequential requests (which may be causing timeouts)

4. **Show a warning toast** if background loading fails partway through, so admins know their data is incomplete

### Changes to Both Pagination Loops (handleLogin + fetchOrders)

Replace:
```typescript
catch {
  break;
}
```

With:
```typescript
catch (pageLoadErr) {
  console.error(`Failed to load page ${p}, retrying...`, pageLoadErr);
  // Retry once
  try {
    await new Promise(r => setTimeout(r, 500));
    const { data: retryData, error: retryErr } = await listOrders("all", p, pageSize);
    if (!retryErr && retryData) {
      if (retryData.orders?.length) accOrders = accOrders.concat(retryData.orders);
      if (retryData.leads?.length) accLeads = accLeads.concat(retryData.leads);
      setOrders([...accOrders]);
      setAllOrders([...accOrders]);
      setLeads([...accLeads]);
    }
  } catch {
    console.error(`Page ${p} retry also failed, continuing to next page`);
    // Continue instead of break -- try remaining pages
  }
}
```

Also add a 100ms delay between page fetches to prevent request piling:
```typescript
// Add inside the for loop, before the try block
await new Promise(r => setTimeout(r, 100));
```

And add an `if (pageErr)` handler that logs instead of silently breaking:
```typescript
if (pageErr) {
  console.error(`Page ${p} returned error:`, pageErr);
  continue; // Try next page instead of breaking
}
```

### Summary of Changes

| File | Change | Purpose |
|------|--------|---------|
| `src/pages/Admin.tsx` (handleLogin loop, ~line 367) | Add retry, logging, continue-instead-of-break | Prevent silent failure of background sync |
| `src/pages/Admin.tsx` (fetchOrders loop, ~line 436) | Same changes | Both entry points use the same pattern |

### What This Fixes

- Dashboard will load all 1,063+ orders instead of stopping at 200
- Failed page loads get retried once before moving on
- Errors are logged to console for debugging
- A single page failure no longer kills the entire sync

### No Risk Assessment

- All changes are in the admin dashboard only -- no customer-facing impact
- The retry adds at most 500ms delay per failed page
- `continue` instead of `break` means even if some pages fail, you get partial data instead of none

