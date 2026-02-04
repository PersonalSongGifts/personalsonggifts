
# Show Scheduled Send Time for Automated Deliveries

## Summary

You want to see **when** items will be automatically sent when filtering by "scheduled" status. Currently, the admin panel shows the "scheduled" badge but doesn't display the actual scheduled send time for the new automation system.

---

## What This Change Will Do

1. **Add a "Scheduled" filter option** in the Orders tab that shows only items waiting to be auto-sent
2. **Display the scheduled send time** (`target_send_at`) on order cards with a countdown indicator
3. **Show time-until-send** (e.g., "Sending in 3h 15m" or "Overdue by 2h")

---

## Changes

### File 1: `src/pages/Admin.tsx`

**Add "Scheduled" filter option** (around line 786-796):
- Add a new SelectItem: `<SelectItem value="scheduled">📅 Scheduled Delivery</SelectItem>`
- This filter will show orders where `automation_status === "completed"` and `target_send_at` is set but `sent_at` is null

**Display scheduled send time on order cards** (around line 1025-1036):
- Show `target_send_at` for orders with `automation_status === "completed"` and `delivery_status === "scheduled"` 
- Add a countdown/overdue indicator using relative time (e.g., "Auto-sending in 2h 30m" or "⚠️ Overdue by 1h")
- Format: `📬 Auto-Send: Wed, Feb 5, 2:00 PM PST (in 3h 15m)`

**Update filter logic** to handle "scheduled" status:
- Filter orders where `automation_status === "completed"`, `sent_at` is null, and `target_send_at` is set

---

## Visual Example

Current card:
```
Jeff    ready  Standard  ✓ completed  ✉ scheduled
Song for: Corri. Core-ee (wife)
Order ID: B074E510
Order Date/Time: Mon, Feb 2, 9:56 AM PST
Expected Delivery: Wed, Feb 4, 9:56 AM PST
```

After change:
```
Jeff    ready  Standard  ✓ completed  ✉ scheduled
Song for: Corri. Core-ee (wife)
Order ID: B074E510
Order Date/Time: Mon, Feb 2, 9:56 AM PST
Expected Delivery: Wed, Feb 4, 9:56 AM PST
📬 Auto-Send: Tue, Feb 4, 6:00 PM PST (in 2h 15m)
```

---

## Technical Details

### Helper Function for Countdown Display

Add a helper function to format the time until send:

```typescript
const formatTimeUntilSend = (targetSendAt: string) => {
  const now = new Date();
  const target = new Date(targetSendAt);
  const diffMs = target.getTime() - now.getTime();
  const diffMins = Math.abs(Math.floor(diffMs / (1000 * 60)));
  const hours = Math.floor(diffMins / 60);
  const mins = diffMins % 60;
  
  if (diffMs > 0) {
    return hours > 0 ? `in ${hours}h ${mins}m` : `in ${mins}m`;
  } else {
    return hours > 0 ? `⚠️ overdue by ${hours}h ${mins}m` : `⚠️ overdue by ${mins}m`;
  }
};
```

### Filter Logic

```typescript
if (statusFilter === "scheduled") {
  return order.automation_status === "completed" 
    && order.target_send_at 
    && !order.sent_at
    && !order.dismissed_at;
}
```

---

## Files to Modify

| File | Changes |
|------|---------|
| `src/pages/Admin.tsx` | Add "Scheduled" filter, display `target_send_at` with countdown on cards |

---

## Impact

- **No database changes needed** - uses existing `target_send_at` field
- **Non-breaking** - just adds visibility to existing automation
- **Helpful for ops** - you can see at a glance when each song will auto-send
