

# Make Song Page Links Work for "Ready" Orders

## Why It's Currently Blocked
The `get-song-page` backend function only returns data for orders with `status = "delivered"`. Orders in `"ready"` status already have a song URL and all the data needed to render the page -- they're just waiting to be sent to the customer.

## Simple Fix
Update the `get-song-page` edge function to accept both `"delivered"` and `"ready"` statuses. This is a minimal change:

### `supabase/functions/get-song-page/index.ts`
- For short ID queries: change `.eq("status", "delivered")` to `.in("status", ["delivered", "ready"])`
- For full UUID queries: no status filter on the query (it already checks afterward)
- Update the guard check from `order.status !== "delivered"` to `!["delivered", "ready"].includes(order.status)`

### `src/pages/Admin.tsx`
- Update the warning to show for statuses other than "delivered" or "ready" (e.g., "pending", "generating")
- Change warning text to: "Link works once song is uploaded"

No new endpoints, no authentication changes, no database changes needed. Orders in earlier statuses (pending, generating) still won't be accessible since they have no song URL anyway.
