

## Fix: Lyrics Not Loading in Admin Order Details

### Problem
The `automation_lyrics` column was intentionally excluded from both the order list query and the CS lookup query in the `admin-orders` edge function to keep payloads small. However, the admin detail dialog relies on this same data to display lyrics -- so lyrics always appear missing, showing "No lyrics yet" or the "Lyrics Paid but content is missing" warning even when lyrics exist in the database.

I confirmed this order (B81C402F) **does** have lyrics in the database, and the lyrics purchase was successful. The problem is purely that the admin UI never receives the lyrics data.

### Solution: Add a "get_order_detail" action

Rather than adding `automation_lyrics` back to every list query (which would bloat the payload for hundreds of orders), we'll add a lightweight single-order fetch that returns the full record when the detail dialog opens.

### Changes

**1. `supabase/functions/admin-orders/index.ts`** -- Add new `get_order_detail` action

- Accepts an `orderId` parameter
- Fetches a single order with ALL columns (including `automation_lyrics`, `prev_automation_lyrics`, `automation_raw_callback`)
- Returns the full order object
- Same pattern for leads: add `get_lead_detail` with `leadId`

**2. `src/pages/Admin.tsx`** -- Fetch full details when dialog opens

- When clicking an order row (currently just `setSelectedOrder(order)`), also fire a call to the new `get_order_detail` action
- When the response arrives, merge the full data into `selectedOrder` so lyrics appear
- The dialog opens instantly with what we already have; lyrics populate a moment later
- Same approach for lead detail dialogs

### What this fixes
- Lyrics will show correctly in order detail dialogs
- The "Lyrics Paid but content missing" warning will only appear when lyrics are genuinely missing
- The Copy Lyrics button and Edit Lyrics functionality will work
- Lead lyrics will also display correctly
- No impact on list query performance (stays lean)

