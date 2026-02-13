
## Fix: Order Search Display Mismatch and Slow Loading UX

### Problem 1: "1 order" shown but "No orders found" in list

The search count badge only checks the search text against `orders`, but the actual list also applies the status filter ("Needs Attention"), the dismissed filter ("Active Only"), and the source filter ("All Sources"). So when you search for `taruz78@gmail.com`, the count says "1 order" because the email matches, but the list shows "No orders found" because the "Needs Attention" filter excludes the order (its status is "ready", not broken).

**Fix**: Make the count badge use the exact same `filteredOrders` array instead of its own separate filter. Also, when a user types in the search box, automatically reset the status filter to "all" so search results aren't hidden by other filters.

### Problem 2: Order counts jumping (200 -> 600 -> 800 -> final)

Every time you refresh or navigate to the Orders tab, all pages re-fetch sequentially and `orders` state updates after each page. This causes the displayed count to increment visibly. Searches during loading may miss orders that haven't been fetched yet.

**Fix**: During background page loading, show a subtle "Loading more..." indicator next to the count so you know data is still coming in. Also, don't update the main orders display on every single page -- batch the updates to reduce visual jumpiness.

### Technical Changes

**File: `src/pages/Admin.tsx`**

1. Move the `filteredOrders` computation earlier (before the count badge), so both the count display and the list use the same filtered result.

2. Remove the duplicated inline filter logic from the count badge (lines 1134-1162) and replace with `filteredOrders.length`.

3. When `orderSearch` changes to a non-empty value, auto-set `statusFilter` to `"all"` so search results aren't hidden behind a status filter. This prevents the "1 order / No orders" mismatch.

4. Add a small "loading..." indicator next to the count when `loadingMore` is true, so you know more data is still being fetched.

5. Batch the background page loading updates: instead of calling `setOrders` after every single page, accumulate all pages and update state once at the end (or every 3 pages). This reduces the 200 -> 400 -> 600 jumps to at most one intermediate update.

### What This Fixes

- Searching for an email will always show the matching order (no more phantom "1 order" with empty list)
- The count and the list will always agree
- Loading will feel smoother with fewer intermediate count jumps
- A "loading more data..." indicator tells you if results are still being fetched
