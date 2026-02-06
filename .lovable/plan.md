

# Fix: Cron Not Picking Up "Scheduled" Orders for Delivery

## Root Cause

When a song finishes generating, the `automation-suno-callback` function sets `delivery_status = "scheduled"`. However, the cron job (`process-scheduled-deliveries`) only picks up orders where `delivery_status IS NULL` or `delivery_status = 'failed'`. The `"scheduled"` status is never matched, so these orders sit indefinitely with a passed `target_send_at` and never get delivered.

## The 4 Affected Orders

| Customer | Order ID | delivery_status | sent_to_emails | Actually Sent? |
|----------|----------|----------------|----------------|----------------|
| Anna Schwarz | 110D097F | scheduled | (none) | No |
| Luis Agosttini | E0CB547B | scheduled | (none) | No |
| Thomas Sims | 03D3D065 | scheduled | (none) | No |
| John | C33AA8CF | scheduled | medellin109@gmail.com | Yes (emergency resend), status not updated |

## Fix (2 Parts)

### Part 1: Fix the cron pickup filter

In `supabase/functions/process-scheduled-deliveries/index.ts`, update the delivery query filter (line 275) from:

```
.or("delivery_status.is.null,delivery_status.eq.failed")
```

to:

```
.or("delivery_status.is.null,delivery_status.eq.scheduled,delivery_status.eq.failed")
```

This allows the cron to pick up orders in the `"scheduled"` state once their `target_send_at` has passed. The existing `.lte("target_send_at", now)` filter ensures orders aren't delivered early.

The same fix applies to the **resend delivery query** and the **lead preview delivery query** sections of the same function, if they have the same pattern.

### Part 2: Fix data for the 4 orders

- **John (C33AA8CF)**: Already sent -- update `delivery_status` to `"sent"` and set `sent_at` to match `delivered_at` so it no longer shows as needing attention.
- **Anna, Luis, Thomas**: Reset `delivery_status` to `NULL` so the cron picks them up immediately on the next run (within 1 minute). Alternatively, since the fix adds `"scheduled"` to the filter, they'll be picked up as-is.

### File Changes

| File | Change |
|------|--------|
| `supabase/functions/process-scheduled-deliveries/index.ts` | Add `delivery_status.eq.scheduled` to the delivery pickup filter |
| Database | Fix John's order status; the other 3 will auto-deliver after the cron fix |

After redeploying the function, the next cron run (within 1 minute) will pick up and deliver Anna's, Luis's, and Thomas's songs automatically.

