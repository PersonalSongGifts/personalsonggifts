

# Add Scheduled Resend for Replacement Songs

## The Problem

When you upload a corrected/replacement song for an already-delivered order, the only option is "Resend Delivery Email" which sends immediately. You want the ability to **schedule** when the replacement notification goes out.

---

## The Solution

Add the same scheduling picker used for initial deliveries to the resend flow for already-delivered orders.

---

## Changes Overview

| File | Change |
|------|--------|
| `src/pages/Admin.tsx` | Show ScheduledDeliveryPicker for delivered orders, add "Schedule Resend" button |
| `supabase/functions/admin-orders/index.ts` | Add `schedule_resend_delivery` action |
| `supabase/functions/process-scheduled-deliveries/index.ts` | Add logic to process scheduled resends |
| `orders` table | Add `resend_scheduled_at` column (nullable timestamp) |

---

## How It Will Work

1. **Admin uploads replacement song** for a delivered order
2. **Scheduling picker appears** with options:
   - **Send Now** - resends immediately (current behavior)
   - **Schedule for Later** - pick date/time (PST)
3. **If scheduled**: Updates `resend_scheduled_at` on the order
4. **Cron job** (running every minute) checks for orders where:
   - `resend_scheduled_at` is in the past
   - `status` = 'delivered'
   - `song_url` exists
5. **Sends the delivery email** and clears `resend_scheduled_at`

---

## UI Changes

**For delivered orders with a song:**

Current:
```
[Resend Delivery Email]
```

New:
```
┌─────────────────────────────────────────┐
│ 📤 Resend Delivery                      │
│                                         │
│ ○ Send Now                              │
│   Resend immediately                    │
│                                         │
│ ○ Schedule for Later                    │
│   Choose a specific date and time (PST) │
│   [Pick date] [Hour] [Min] PST          │
│                                         │
│ [Resend Delivery Email] or              │
│ [Schedule Resend] (if scheduled)        │
└─────────────────────────────────────────┘
```

---

## Technical Details

### 1. Database Migration

Add column to track scheduled resends:

```sql
ALTER TABLE orders ADD COLUMN resend_scheduled_at timestamptz;
```

### 2. Admin Orders Edge Function

New action `schedule_resend_delivery`:
- Validates the order exists and has a song
- Sets `resend_scheduled_at` to the provided timestamp
- Returns success message with scheduled time

### 3. Scheduled Deliveries Processor

Add a new section to check for orders where:
- `resend_scheduled_at <= now()`
- `status = 'delivered'`
- `song_url IS NOT NULL`

For each match:
- Call `send-song-delivery` edge function
- Clear `resend_scheduled_at` to prevent duplicate sends

### 4. Admin UI Updates

In the order details dialog for delivered orders:
- Add state for `resendScheduledTime`
- Show ScheduledDeliveryPicker (reuse existing component)
- Change button based on selection:
  - No time selected: "Resend Delivery Email" (current behavior)
  - Time selected: "Schedule Resend"
- Show pending scheduled resend indicator if one exists

---

## Edge Cases Handled

| Scenario | Behavior |
|----------|----------|
| Admin uploads new song + schedules resend | Works as expected |
| Admin changes their mind | Can clear the scheduled resend |
| Scheduled time passes | Cron processes and sends |
| Admin cancels schedule | Set `resend_scheduled_at` to null |
| Multiple song replacements | Each upload just updates the song; schedule controls when email goes out |

