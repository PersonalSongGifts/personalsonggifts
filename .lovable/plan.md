

## Fix: Order EE84BC3C "Song Not Found" on Song Page

### Root Cause

The order has `status = "completed"` but the `get-song-page` edge function only serves songs for orders with status `"delivered"` or `"ready"`. This is a lead-converted order (`source: lead_conversion`) where the status was set to `completed` but never transitioned to `delivered` because the delivery email was never sent.

The `song_url` is valid and present. The fix has two parts:

### Part 1: Immediate Database Fix

Update this specific order's status to `delivered` so the song page works now:

```sql
UPDATE orders
SET status = 'delivered',
    delivered_at = now(),
    delivery_status = 'sent'
WHERE id = 'ee84bc3c-d416-4947-9d0a-c07d987cb2b4';
```

### Part 2: Prevent Future Occurrences

Update the `get-song-page` edge function to also accept `"completed"` status orders (when they have a valid `song_url`). This way, even if the delivery pipeline hasn't run yet, customers can still access their song page.

**File:** `supabase/functions/get-song-page/index.ts`

Change the status check from:
```typescript
if (!["delivered", "ready"].includes(order.status) || !order.song_url)
```
to:
```typescript
if (!["delivered", "ready", "completed"].includes(order.status) || !order.song_url)
```

This is safe because `completed` means the song is generated and ready — the only missing step is the delivery email, which shouldn't block the song page from loading.

